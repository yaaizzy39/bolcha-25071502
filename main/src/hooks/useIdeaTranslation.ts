import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { translateText } from '../translation';
import { detectLanguage } from '../langDetect';
import { useI18n } from '../i18n';
import type { IdeaData, ProjectIdeaData } from '../types';

// Base interface for ideas with translation capabilities
interface BaseTranslatableIdea {
  id: string;
  title: string;
  content: string;
  staffComment?: string;
  developmentPeriod?: string;
  originalLang?: string;
  translations?: Record<string, { title: string; content: string; staffComment?: string; developmentPeriod?: string; }>;
}

interface TranslationState {
  translating: Set<string>;
  translatedIds: Set<string>;
}

export function useIdeaTranslation<T extends BaseTranslatableIdea>(collectionName: 'globalIdeas' | 'projectIdeas') {
  const { lang: uiLang } = useI18n();
  
  // Independent translation language state (separate from UI language)
  const [translationLang, setTranslationLang] = useState<string>(() => {
    return localStorage.getItem(`idea_translation_lang_${collectionName}`) || uiLang;
  });

  // Force update counter to trigger re-renders
  const [updateCounter, setUpdateCounter] = useState(0);

  // Track failed translations to prevent infinite loops
  const failedTranslationsRef = useRef<Set<string>>(new Set());
  const translationAttemptsRef = useRef<Map<string, number>>(new Map());
  const MAX_TRANSLATION_ATTEMPTS = 3;

  // Save translation language preference
  useEffect(() => {
    localStorage.setItem(`idea_translation_lang_${collectionName}`, translationLang);
  }, [translationLang, collectionName]);

  // Don't auto-sync with UI language - let user control translation language independently
  // useEffect(() => {
  //   if (translationLang !== uiLang) {
  //     setTranslationLang(uiLang);
  //   }
  // }, [uiLang]);
  const [translationState, setTranslationState] = useState<TranslationState>({
    translating: new Set(),
    translatedIds: new Set()
  });
  
  const translatedIdsRef = useRef<Set<string>>(new Set());
  const translatingRef = useRef<Set<string>>(new Set());
  
  // Local storage for translations when Firestore fails
  const [localTranslations, setLocalTranslations] = useState<Record<string, Record<string, { title: string; content: string; staffComment?: string; }>>>(() => {
    const stored = localStorage.getItem(`local-translations-${collectionName}`);
    return stored ? JSON.parse(stored) : {};
  });

  // Reset translated ID cache when translation language changes
  useEffect(() => {
    translatedIdsRef.current = new Set(
      JSON.parse(sessionStorage.getItem(`translated-ideas-${translationLang}`) || '[]')
    );
    setTranslationState(prev => ({
      ...prev,
      translatedIds: new Set(translatedIdsRef.current)
    }));
  }, [translationLang]);

  const saveTranslatedId = (id: string) => {
    translatedIdsRef.current.add(id);
    sessionStorage.setItem(`translated-ideas-${translationLang}`, JSON.stringify(Array.from(translatedIdsRef.current)));
    setTranslationState(prev => ({
      ...prev,
      translatedIds: new Set(translatedIdsRef.current)
    }));
  };

  // Get translated content for display with enhanced fallback logic
  const getTranslatedContent = (idea: T) => {
    console.log(`getTranslatedContent for idea ${idea.id}:`, {
      translationLang,
      originalLang: idea.originalLang,
      hasTranslations: !!idea.translations,
      translationKeys: idea.translations ? Object.keys(idea.translations) : [],
      hasTargetTranslation: !!idea.translations?.[translationLang],
      hasLocalTranslation: !!localTranslations[idea.id]?.[translationLang],
      originalStaffComment: idea.staffComment,
      translatedStaffCommentInFirestore: idea.translations?.[translationLang]?.staffComment,
      translatedStaffCommentInLocal: localTranslations[idea.id]?.[translationLang]?.staffComment
    });
    
    // Check local translations first (for when Firestore fails)
    const localTranslation = localTranslations[idea.id]?.[translationLang];
    const firestoreTranslation = idea.translations?.[translationLang];
    
    // For different languages, prioritize translations
    if (idea.originalLang !== translationLang) {
      console.log(`Different language (${idea.originalLang} -> ${translationLang}) - looking for translation`);
      
      // Use translation if available, otherwise fall back to original
      if (localTranslation || firestoreTranslation) {
        console.log(`Found translation for different language`);
        return {
          title: localTranslation?.title || firestoreTranslation?.title || idea.title,
          content: localTranslation?.content || firestoreTranslation?.content || idea.content,
          staffComment: localTranslation?.staffComment || firestoreTranslation?.staffComment || idea.staffComment,
          developmentPeriod: localTranslation?.developmentPeriod || firestoreTranslation?.developmentPeriod || idea.developmentPeriod
        };
      }
    }
    
    // Same language or no translation available - use original content
    console.log(`Same language (${translationLang}) or no translation - using original content`);
    return {
      title: idea.title,
      content: idea.content,
      staffComment: idea.staffComment,
      developmentPeriod: idea.developmentPeriod
    };
    
    // Different original language - combine available translations
    const combinedTranslation = {
      title: localTranslation?.title || firestoreTranslation?.title || idea.title,
      content: localTranslation?.content || firestoreTranslation?.content || idea.content,
      staffComment: localTranslation?.staffComment || firestoreTranslation?.staffComment || idea.staffComment,
      developmentPeriod: localTranslation?.developmentPeriod || firestoreTranslation?.developmentPeriod || idea.developmentPeriod
    };
    
    if (localTranslation || firestoreTranslation) {
      console.log(`Using combined translation for ${translationLang}:`, combinedTranslation);
      return combinedTranslation;
    }
    
    // No translation available, return original content
    console.log(`No translation available for ${translationLang}, using original content`);
    return {
      title: idea.title,
      content: idea.content,
      staffComment: idea.staffComment,
      developmentPeriod: idea.developmentPeriod
    };
  };

  // Check if translation is needed
  const needsTranslation = (idea: T): boolean => {
    // If currently translating, no need
    if (translatingRef.current.has(idea.id)) {
      return false;
    }
    
    // Check if we have complete translation (including staffComment if it exists)
    const existingTranslation = idea.translations?.[translationLang] || localTranslations[idea.id]?.[translationLang];
    
    // For same original language, only check if we need staff comment translation
    if (idea.originalLang === translationLang) {
      // If we have no translation data for this language, we might need translation
      if (!existingTranslation) {
        // Check if the idea was originally created in a different language and we need translations
        if (idea.translations && Object.keys(idea.translations).length > 0) {
          return true; // Has translations for other languages, should have one for this too
        }
        return false; // No translations exist, this is original content
      }
      
      // If there's a staffComment but no translated staffComment, we need translation
      if (idea.staffComment && !existingTranslation.staffComment) {
        return true;
      }
      return false;
    }
    
    // Different language - check for missing translations
    if (existingTranslation) {
      // If there's a staffComment but no translated staffComment, we need translation
      if (idea.staffComment && !existingTranslation.staffComment) {
        return true;
      }
      // If we have all needed translations, no need
      return false;
    }
    
    return true;
  };

  // Translate a single idea
  const translateIdea = async (idea: T): Promise<void> => {
    console.log(`translateIdea called for ${idea.id} to ${translationLang}:`, {
      needsTranslation: needsTranslation(idea),
      isTranslating: translatingRef.current.has(idea.id),
      originalLang: idea.originalLang,
      targetLang: translationLang,
      hasStaffComment: !!idea.staffComment
    });
    
    if (!needsTranslation(idea) || translatingRef.current.has(idea.id)) {
      console.log(`Skipping translation for ${idea.id}: needsTranslation=${needsTranslation(idea)}, isTranslating=${translatingRef.current.has(idea.id)}`);
      return;
    }

    try {
      translatingRef.current.add(idea.id);
      setTranslationState(prev => ({
        ...prev,
        translating: new Set(translatingRef.current)
      }));

      // Translate title and content
      const [translatedTitle, translatedContent, translatedStaffComment] = await Promise.all([
        translateText(idea.title, translationLang),
        translateText(idea.content, translationLang),
        idea.staffComment ? translateText(idea.staffComment, translationLang) : Promise.resolve(idea.staffComment)
      ]);

      if (translatedTitle || translatedContent) {
        const translationData = {
          title: translatedTitle || idea.title,
          content: translatedContent || idea.content,
          ...(idea.staffComment && { staffComment: translatedStaffComment || idea.staffComment })
        };

        try {
          // Update Firestore with translations
          await updateDoc(doc(db, collectionName, idea.id), {
            [`translations.${translationLang}`]: translationData
          });
          saveTranslatedId(idea.id);
        } catch (firestoreError) {
          console.warn('Firestore update failed, storing locally:', firestoreError);
          
          // Store translation locally if Firestore fails
          const newLocalTranslations = {
            ...localTranslations,
            [idea.id]: {
              ...localTranslations[idea.id],
              [translationLang]: translationData
            }
          };
          setLocalTranslations(newLocalTranslations);
          localStorage.setItem(`local-translations-${collectionName}`, JSON.stringify(newLocalTranslations));
          saveTranslatedId(idea.id);
        }
      }
    } catch (error) {
      console.error('Translation failed for idea:', idea.id, error);
      // Mark as translated to prevent retries on permission errors
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        saveTranslatedId(idea.id);
      }
    } finally {
      translatingRef.current.delete(idea.id);
      setTranslationState(prev => ({
        ...prev,
        translating: new Set(translatingRef.current)
      }));
    }
  };

  // Batch translate multiple ideas
  const translateIdeas = async (ideas: T[], maxConcurrent = 3): Promise<void> => {
    const toTranslate = ideas.filter(needsTranslation);
    
    if (toTranslate.length === 0) return;

    // Process in batches to avoid overwhelming the translation service
    for (let i = 0; i < toTranslate.length; i += maxConcurrent) {
      const batch = toTranslate.slice(i, i + maxConcurrent);
      await Promise.all(batch.map(idea => translateIdea(idea)));
      
      // Small delay between batches
      if (i + maxConcurrent < toTranslate.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  // Auto-translate ideas when language changes
  const autoTranslateIdeas = async (ideas: T[]): Promise<void> => {
    const untranslatedIdeas = ideas.filter(idea => 
      needsTranslation(idea) && !translatedIdsRef.current.has(idea.id)
    );

    if (untranslatedIdeas.length > 0) {
      // Limit auto-translation to avoid hitting API limits
      const limitedIdeas = untranslatedIdeas.slice(0, 10);
      await translateIdeas(limitedIdeas, 2);
    }
  };

  // Check if we should attempt translation (not exceeding retry limit)
  const shouldAttemptTranslation = (ideaId: string, part: string): boolean => {
    const key = `${ideaId}-${part}-${translationLang}`;
    
    // Check if this translation has failed too many times
    if (failedTranslationsRef.current.has(key)) {
      console.log(`⏭️ Skipping translation for ${key} - already marked as failed`);
      return false;
    }
    
    // Check attempt count
    const attempts = translationAttemptsRef.current.get(key) || 0;
    if (attempts >= MAX_TRANSLATION_ATTEMPTS) {
      console.log(`⏭️ Skipping translation for ${key} - max attempts (${MAX_TRANSLATION_ATTEMPTS}) reached`);
      failedTranslationsRef.current.add(key);
      return false;
    }
    
    return true;
  };

  // Track translation attempt
  const trackTranslationAttempt = (ideaId: string, part: string): void => {
    const key = `${ideaId}-${part}-${translationLang}`;
    const attempts = translationAttemptsRef.current.get(key) || 0;
    translationAttemptsRef.current.set(key, attempts + 1);
    console.log(`📊 Translation attempt ${attempts + 1}/${MAX_TRANSLATION_ATTEMPTS} for ${key}`);
  };

  // Mark translation as failed
  const markTranslationFailed = (ideaId: string, part: string, reason: string): void => {
    const key = `${ideaId}-${part}-${translationLang}`;
    failedTranslationsRef.current.add(key);
    console.log(`❌ Marking translation as failed: ${key} - ${reason}`);
  };

  // Check if a translation looks incorrect (e.g., English text when expecting Japanese)
  const isTranslationIncorrect = (originalText: string, translatedText: string, targetLang: string): boolean => {
    if (!translatedText || !originalText) return false;
    
    // If original and translated are identical, it's likely a translation failure
    if (originalText.trim() === translatedText.trim()) {
      console.log(`❌ Translation failed: identical original and translated text`);
      console.log(`   Text: "${originalText}"`);
      return true;
    }
    
    const isOriginalEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(originalText.trim());
    const isOriginalJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(originalText.trim());
    
    const isTranslatedEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(translatedText.trim());
    const isTranslatedJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(translatedText.trim());
    
    // If translating English to Japanese, result should contain Japanese characters
    if (isOriginalEnglish && targetLang === 'ja' && !isTranslatedJapanese) {
      console.log(`❌ Incorrect translation detected: English->Japanese but result is not Japanese`);
      console.log(`   Original: "${originalText}"`);
      console.log(`   Translated: "${translatedText}"`);
      return true;
    }
    
    // If translating Japanese to English, result should contain mostly English characters
    if (isOriginalJapanese && targetLang === 'en' && !isTranslatedEnglish) {
      console.log(`❌ Incorrect translation detected: Japanese->English but result is not English`);
      console.log(`   Original: "${originalText}"`);
      console.log(`   Translated: "${translatedText}"`);
      return true;
    }
    
    return false;
  };

  // Comprehensive translation check for all content (title, content, staffComment)
  const ensureTranslationsExist = async (ideas: T[]): Promise<void> => {
    console.log(`🔍 CHECKING TRANSLATIONS for ${ideas.length} ideas to language: ${translationLang}`);
    
    let translationCount = 0;
    
    for (const idea of ideas) {
      // Check if any translation is missing for current language
      const existingTranslation = idea.translations?.[translationLang] || localTranslations[idea.id]?.[translationLang];
      
      let needsTranslation = false;
      let missingParts: string[] = [];

      // For same language as original, only check staffComment individually
      if (idea.originalLang === translationLang) {
        // Check staffComment separately since it might be in a different language
        if (idea.staffComment) {
          const hasTranslatedStaffComment = !!existingTranslation?.staffComment;
          
          if (!hasTranslatedStaffComment) {
            // No translation exists - check if original is in different language
            const isLikelyEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(idea.staffComment.trim());
            const isLikelyJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(idea.staffComment.trim());
            
            if (translationLang === 'ja' && isLikelyEnglish && !isLikelyJapanese) {
              needsTranslation = true;
              missingParts.push('staffComment (English->Japanese)');
            } else if (translationLang === 'en' && isLikelyJapanese && !isLikelyEnglish) {
              needsTranslation = true;
              missingParts.push('staffComment (Japanese->English)');
            }
          } else {
            // Translation exists - check if it's correct AND if we should retry
            if (isTranslationIncorrect(idea.staffComment, existingTranslation.staffComment, translationLang)) {
              if (shouldAttemptTranslation(idea.id, 'staffComment')) {
                needsTranslation = true;
                missingParts.push('staffComment (incorrect translation)');
                console.log(`🗑️ Will clear incorrect translation for idea ${idea.id}`);
                
                // Track this attempt
                trackTranslationAttempt(idea.id, 'staffComment');
                
                // Clear the incorrect translation
                try {
                  await clearFirestoreTranslation(idea.id, translationLang);
                } catch (error) {
                  console.warn("Failed to clear incorrect translation, continuing");
                }
              } else {
                console.log(`⏭️ Skipping retry for incorrect translation - max attempts reached`);
                markTranslationFailed(idea.id, 'staffComment', 'max retry attempts reached');
              }
            }
          }
        }
      } else {
        // Different original language - check all parts
        
        // Check title
        if (!existingTranslation?.title) {
          needsTranslation = true;
          missingParts.push('title');
        }

        // Check content
        if (!existingTranslation?.content) {
          needsTranslation = true;
          missingParts.push('content');
        }

        // Check staffComment if it exists
        if (idea.staffComment) {
          if (!existingTranslation?.staffComment) {
            needsTranslation = true;
            missingParts.push('staffComment');
          } else if (isTranslationIncorrect(idea.staffComment, existingTranslation.staffComment, translationLang)) {
            needsTranslation = true;
            missingParts.push('staffComment (incorrect translation)');
            // Clear the incorrect translation
            try {
              await clearFirestoreTranslation(idea.id, translationLang);
            } catch (error) {
              console.warn("Failed to clear incorrect translation, continuing");
            }
          }
        }
      }

      if (needsTranslation) {
        console.log(`❗ Idea ${idea.id} needs translation for: ${missingParts.join(', ')}`);
        console.log(`   Current translations:`, existingTranslation);
        console.log(`   Staff comment exists:`, !!idea.staffComment);
        console.log(`   Original lang: ${idea.originalLang}, Target lang: ${translationLang}`);
        
        try {
          translationCount++;
          console.log(`🚀 Starting translation ${translationCount} for idea ${idea.id}`);
          
          await forceTranslateIdea(idea);
          console.log(`✅ Successfully translated idea ${idea.id} to ${translationLang}`);
          
          // Add delay between translations
          if (translationCount < ideas.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`❌ Failed to translate idea ${idea.id}:`, error);
        }
      } else {
        console.log(`✅ Idea ${idea.id} already has complete and correct translation for ${translationLang}`);
      }
    }
    
    console.log(`🏁 Translation check completed. Translated ${translationCount} ideas.`);
  };

  // Check if idea needs translation to multiple languages (for staff comments)
  const needsMultiLanguageTranslation = (idea: T): boolean => {
    if (!idea.staffComment) return false;
    
    // Define target languages for staff comments
    const targetLanguages = ['ja', 'en', 'zh', 'ko', 'es', 'fr'];
    
    // Check if translations are missing for any target language
    return targetLanguages.some(lang => {
      if (lang === idea.originalLang) return false; // Skip original language
      return !idea.translations?.[lang]?.staffComment;
    });
  };

  // Translate staff comment and development period to all supported languages
  const translateStaffCommentToAllLanguages = async (idea: T): Promise<void> => {
    if (!idea.staffComment && !idea.developmentPeriod) return;
    
    const targetLanguages = ['ja', 'en', 'zh', 'ko', 'es', 'fr'];
    const translationsToCreate: Record<string, { title: string; content: string; staffComment?: string; developmentPeriod?: string }> = {};
    
    for (const targetLang of targetLanguages) {
      if (targetLang === idea.originalLang) {
        // For original language, use original content
        translationsToCreate[targetLang] = {
          title: idea.title,
          content: idea.content,
          ...(idea.staffComment && { staffComment: idea.staffComment }),
          ...(idea.developmentPeriod && { developmentPeriod: idea.developmentPeriod })
        };
      } else if (!idea.translations?.[targetLang]?.staffComment || 
                 (idea.developmentPeriod && !idea.translations?.[targetLang]?.developmentPeriod)) {
        // Need to translate to this language
        try {
          const translationPromises = [
            idea.translations?.[targetLang]?.title ? Promise.resolve(idea.translations[targetLang].title) : translateText(idea.title, targetLang),
            idea.translations?.[targetLang]?.content ? Promise.resolve(idea.translations[targetLang].content) : translateText(idea.content, targetLang)
          ];

          // Add staff comment translation if needed
          if (idea.staffComment) {
            translationPromises.push(translateText(idea.staffComment, targetLang));
          }

          // Add development period translation if needed
          if (idea.developmentPeriod) {
            translationPromises.push(translateText(idea.developmentPeriod, targetLang));
          }

          const results = await Promise.all(translationPromises);
          let translatedTitle = results[0];
          let translatedContent = results[1];
          let translatedStaffComment = idea.staffComment ? results[2] : undefined;
          let translatedDevelopmentPeriod = idea.developmentPeriod ? results[idea.staffComment ? 3 : 2] : undefined;
          
          const translationData: any = {
            title: translatedTitle || idea.title,
            content: translatedContent || idea.content
          };

          if (idea.staffComment && translatedStaffComment) {
            translationData.staffComment = translatedStaffComment;
          }

          if (idea.developmentPeriod && translatedDevelopmentPeriod) {
            translationData.developmentPeriod = translatedDevelopmentPeriod;
          }

          if (Object.keys(translationData).length > 2) { // More than just title and content
            translationsToCreate[targetLang] = translationData;
          }
        } catch (error) {
          console.error(`Failed to translate to ${targetLang}:`, error);
        }
      }
    }
    
    // Update Firestore with all translations
    if (Object.keys(translationsToCreate).length > 0) {
      try {
        const updateData: Record<string, any> = {};
        Object.entries(translationsToCreate).forEach(([lang, translation]) => {
          updateData[`translations.${lang}`] = translation;
        });
        
        await updateDoc(doc(db, collectionName, idea.id), updateData);
        console.log(`Multi-language translation completed for idea ${idea.id}`, translationsToCreate);
      } catch (error) {
        console.error('Failed to update multi-language translations:', error);
      }
    }
  };

  // Clear translation cache for a specific idea
  const clearTranslationCache = (id: string) => {
    translatedIdsRef.current.delete(id);
    sessionStorage.setItem(`translated-ideas-${translationLang}`, JSON.stringify(Array.from(translatedIdsRef.current)));
    setTranslationState(prev => ({
      ...prev,
      translatedIds: new Set(translatedIdsRef.current)
    }));
    
    // Also clear local translations
    if (localTranslations[id]) {
      const newLocalTranslations = { ...localTranslations };
      delete newLocalTranslations[id];
      setLocalTranslations(newLocalTranslations);
      localStorage.setItem(`local-translations-${collectionName}`, JSON.stringify(newLocalTranslations));
    }
  };

  // Clear all translations for a specific idea and language from Firestore
  const clearFirestoreTranslation = async (id: string, lang: string): Promise<void> => {
    try {
      console.log(`🗑️ Clearing Firestore translation for idea ${id}, language ${lang}`);
      
      await updateDoc(doc(db, collectionName, id), {
        [`translations.${lang}`]: null
      });
      
      console.log(`✅ Successfully cleared Firestore translation for idea ${id}, language ${lang}`);
    } catch (error) {
      console.error(`❌ Failed to clear Firestore translation:`, error);
      throw error;
    }
  };

  // Force retranslate by clearing existing translation and creating new one
  const forceRetranslateIdea = async (idea: T, targetLang?: string): Promise<void> => {
    const langToTranslate = targetLang || translationLang;
    
    console.log(`🔄 FORCE RETRANSLATING ${idea.id} to ${langToTranslate}`);
    console.log(`   - Will clear existing translation and create fresh one`);
    
    // Clear cache first
    clearTranslationCache(idea.id);
    
    // Clear Firestore translation for this language
    try {
      await clearFirestoreTranslation(idea.id, langToTranslate);
    } catch (error) {
      console.warn("Failed to clear Firestore translation, continuing with local clear");
    }
    
    // Wait a bit for Firestore to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now force translate
    await forceTranslateIdea(idea);
  };

  // Force translate idea regardless of cache or existing translations
  const forceTranslateIdea = async (idea: T): Promise<void> => {
    if (translatingRef.current.has(idea.id)) {
      console.log(`Already translating ${idea.id}, skipping force translate`);
      return;
    }

    console.log(`🔄 FORCE TRANSLATING ${idea.id} to ${translationLang}`);
    console.log(`   - Title: ${idea.title}`);
    console.log(`   - Content: ${idea.content?.substring(0, 50)}...`);
    console.log(`   - StaffComment: ${idea.staffComment || 'none'}`);
    console.log(`   - OriginalLang: ${idea.originalLang}`);
    console.log(`   - TargetLang: ${translationLang}`);
    
    try {
      translatingRef.current.add(idea.id);
      setTranslationState(prev => ({
        ...prev,
        translating: new Set(translatingRef.current)
      }));

      // Determine what needs to be translated
      const isOriginalLang = idea.originalLang === translationLang;
      const existingTranslation = idea.translations?.[translationLang] || localTranslations[idea.id]?.[translationLang];
      
      console.log(`About to translate for ${idea.id}:`, {
        title: idea.title,
        content: idea.content?.substring(0, 50) + '...',
        staffComment: idea.staffComment,
        hasStaffComment: !!idea.staffComment,
        staffCommentLength: idea.staffComment?.length || 0,
        targetLang: translationLang,
        isOriginalLang,
        existingTranslation
      });

      let translatedTitle, translatedContent, translatedStaffComment;

      if (isOriginalLang) {
        // Same language - only translate staffComment if needed
        translatedTitle = existingTranslation?.title || idea.title;
        translatedContent = existingTranslation?.content || idea.content;
        
        if (idea.staffComment && !existingTranslation?.staffComment) {
          console.log(`🔄 Translating only staffComment for same-language idea ${idea.id}`);
          translatedStaffComment = await translateText(idea.staffComment, translationLang);
        } else {
          translatedStaffComment = existingTranslation?.staffComment || idea.staffComment;
        }
      } else {
        // Different language - translate everything needed
        const promises = [
          existingTranslation?.title ? Promise.resolve(existingTranslation.title) : translateText(idea.title, translationLang),
          existingTranslation?.content ? Promise.resolve(existingTranslation.content) : translateText(idea.content, translationLang),
          (idea.staffComment && !existingTranslation?.staffComment) ? translateText(idea.staffComment, translationLang) : Promise.resolve(existingTranslation?.staffComment || idea.staffComment)
        ];
        
        [translatedTitle, translatedContent, translatedStaffComment] = await Promise.all(promises);
      }

      console.log(`Translation results for ${idea.id}:`, {
        translatedTitle: translatedTitle?.substring(0, 50) + '...',
        translatedContent: translatedContent?.substring(0, 50) + '...',
        translatedStaffComment,
        originalStaffComment: idea.staffComment
      });

      if (translatedTitle || translatedContent || translatedStaffComment) {
        const translationData = {
          title: translatedTitle || idea.title,
          content: translatedContent || idea.content,
          ...(idea.staffComment && { staffComment: translatedStaffComment || idea.staffComment })
        };

        try {
          // Update Firestore with translations
          await updateDoc(doc(db, collectionName, idea.id), {
            [`translations.${translationLang}`]: translationData
          });
          saveTranslatedId(idea.id);
          console.log(`Force translation successful for ${idea.id}`, translationData);
          
          // Force a re-render by updating local state and counter
          setLocalTranslations(prev => ({
            ...prev,
            [idea.id]: {
              ...prev[idea.id],
              [translationLang]: translationData
            }
          }));
          
          // Force re-render
          setUpdateCounter(prev => prev + 1);
          
        } catch (firestoreError) {
          console.warn('Firestore update failed, storing locally:', firestoreError);
          
          // Store translation locally if Firestore fails
          const newLocalTranslations = {
            ...localTranslations,
            [idea.id]: {
              ...localTranslations[idea.id],
              [translationLang]: translationData
            }
          };
          setLocalTranslations(newLocalTranslations);
          localStorage.setItem(`local-translations-${collectionName}`, JSON.stringify(newLocalTranslations));
          saveTranslatedId(idea.id);
          
          // Force re-render for local storage case too
          setUpdateCounter(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Force translation failed for idea:', idea.id, error);
    } finally {
      translatingRef.current.delete(idea.id);
      setTranslationState(prev => ({
        ...prev,
        translating: new Set(translatingRef.current)
      }));
    }
  };

  return {
    getTranslatedContent,
    needsTranslation,
    needsMultiLanguageTranslation,
    translateIdea,
    forceTranslateIdea,
    forceRetranslateIdea,
    clearFirestoreTranslation,
    translateStaffCommentToAllLanguages,
    translateIdeas,
    autoTranslateIdeas,
    ensureTranslationsExist,
    clearTranslationCache,
    isTranslating: (id: string) => translationState.translating.has(id),
    isTranslated: (id: string) => translationState.translatedIds.has(id),
    translationLang,
    setTranslationLang
  };
}