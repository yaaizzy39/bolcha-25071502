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
  originalLang?: string;
  translations?: Record<string, { title: string; content: string; staffComment?: string; }>;
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

  // Save translation language preference
  useEffect(() => {
    localStorage.setItem(`idea_translation_lang_${collectionName}`, translationLang);
  }, [translationLang, collectionName]);
  const [translationState, setTranslationState] = useState<TranslationState>({
    translating: new Set(),
    translatedIds: new Set()
  });
  
  const translatedIdsRef = useRef<Set<string>>(new Set());
  const translatingRef = useRef<Set<string>>(new Set());

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

  // Get translated content for display
  const getTranslatedContent = (idea: T) => {
    if (!idea.translations?.[translationLang]) {
      // If original language matches current translation language, return original
      if (idea.originalLang === translationLang) {
        return {
          title: idea.title,
          content: idea.content,
          staffComment: idea.staffComment
        };
      }
      // Otherwise return original content (will be translated later)
      return {
        title: idea.title,
        content: idea.content,
        staffComment: idea.staffComment
      };
    }
    
    // Return translated content, fallback to original for missing fields
    const translation = idea.translations[translationLang];
    return {
      title: translation.title || idea.title,
      content: translation.content || idea.content,
      staffComment: translation.staffComment || idea.staffComment
    };
  };

  // Check if translation is needed
  const needsTranslation = (idea: T): boolean => {
    // If already translated or currently translating, no need
    if (idea.translations?.[translationLang] || translatingRef.current.has(idea.id)) {
      return false;
    }
    
    // If original language matches current translation language, no need
    if (idea.originalLang === translationLang) {
      return false;
    }
    
    return true;
  };

  // Translate a single idea
  const translateIdea = async (idea: T): Promise<void> => {
    if (!needsTranslation(idea) || translatingRef.current.has(idea.id)) {
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
        idea.staffComment ? translateText(idea.staffComment, translationLang) : Promise.resolve(null)
      ]);

      if (translatedTitle || translatedContent) {
        const translationData = {
          title: translatedTitle || idea.title,
          content: translatedContent || idea.content,
          ...(translatedStaffComment && { staffComment: translatedStaffComment })
        };

        // Update Firestore with translations
        await updateDoc(doc(db, collectionName, idea.id), {
          [`translations.${translationLang}`]: translationData
        });

        saveTranslatedId(idea.id);
      }
    } catch (error) {
      console.error('Translation failed for idea:', idea.id, error);
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

  return {
    getTranslatedContent,
    needsTranslation,
    translateIdea,
    translateIdeas,
    autoTranslateIdeas,
    isTranslating: (id: string) => translationState.translating.has(id),
    isTranslated: (id: string) => translationState.translatedIds.has(id),
    translationLang,
    setTranslationLang
  };
}