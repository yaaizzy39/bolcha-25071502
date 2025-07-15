import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "firebase/auth";
import type { ProjectIdeaData, IdeaStatus, UserRole, ProjectData } from "../types";
import useUserRole from "../hooks/useUserRole";
import { useI18n } from "../i18n";
import { useIdeaTranslation } from "../hooks/useIdeaTranslation";
import ConfirmModal from "../components/ConfirmModal";
import { detectLanguage } from "../langDetect";
import { useUserPrefs } from "../hooks/useUserPrefs";
import { IconDownload } from "../components/icons";

interface ProjectIdeasProps {
  user: User;
}

const ProjectIdeas = ({ user }: ProjectIdeasProps) => {
  const { t, lang } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const [ideas, setIdeas] = useState<ProjectIdeaData[]>([]);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfiles, setUserProfiles] = useState<Record<string, { nickname: string; avatar: string }>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ProjectIdeaData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: ""
  });
  const [staffComments, setStaffComments] = useState<Record<string, string>>({});
  const [editingComments, setEditingComments] = useState<Record<string, boolean>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, IdeaStatus>>({});
  const [developmentPeriods, setDevelopmentPeriods] = useState<Record<string, string>>({});
  const [editingPeriods, setEditingPeriods] = useState<Record<string, boolean>>({});
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null);
  
  const userRole = useUserRole(user);
  const { prefs } = useUserPrefs(user.uid);
  
  const { 
    getTranslatedContent, 
    translateIdea,
    forceTranslateIdea,
    forceRetranslateIdea,
    clearFirestoreTranslation,
    translateStaffCommentToAllLanguages,
    autoTranslateIdeas,
    ensureTranslationsExist,
    clearTranslationCache,
    isTranslating,
    translationLang,
    setTranslationLang
  } = useIdeaTranslation<ProjectIdeaData>('projectIdeas');

  // Format date with timezone and minutes precision
  const formatDate = (timestamp: any, showTime: boolean = true) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const timezone = prefs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    };
    
    if (showTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = false;
    }
    
    return new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : 'en-US', options).format(date);
  };

  // Check if user has access to this project
  const hasProjectAccess = () => {
    if (!project) return false;
    const isAdmin = userRole === 'admin';
    const isMember = project.members && project.members[user.uid];
    const isCreator = project.createdBy === user.uid;
    return isAdmin || isMember || isCreator;
  };

  // Get user's role within this project
  const getProjectUserRole = (): UserRole => {
    if (userRole === 'admin') return 'admin';
    if (!project?.members) return userRole;
    
    const projectRole = project.members[user.uid];
    if (projectRole === 'staff') return 'staff';
    if (projectRole === 'user') return 'user';
    
    return userRole;
  };

  useEffect(() => {
    if (!projectId) return;

    // Get project info
    const getProject = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", projectId));
        if (projectDoc.exists()) {
          const projectData = {
            id: projectDoc.id,
            ...projectDoc.data()
          } as ProjectData;
          
          setProject(projectData);
          
          // Check if user has access to this project
          const isAdmin = userRole === 'admin';
          const isMember = projectData.members && projectData.members[user.uid];
          const isCreator = projectData.createdBy === user.uid;
          
          if (!isAdmin && !isMember && !isCreator) {
            // User doesn't have access, redirect or show error
            alert("このプロジェクトにアクセスする権限がありません / You don't have access to this project");
            window.location.href = '/projects';
            return;
          }
        } else {
          alert("プロジェクトが見つかりません / Project not found");
          window.location.href = '/projects';
          return;
        }
      } catch (error) {
        console.error("Error fetching project:", error);
      }
    };

    getProject();

    // Listen to project ideas
    try {
      const q = query(
        collection(db, "projectIdeas"),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ideasData: ProjectIdeaData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as ProjectIdeaData;
          if (data.projectId === projectId) {
            ideasData.push({
              id: doc.id,
              ...data
            });
          }
        });
        setIdeas(ideasData);
        setLoading(false);
        
        // Update selected statuses to match current idea values
        const statusUpdates: Record<string, IdeaStatus> = {};
        ideasData.forEach(idea => {
          statusUpdates[idea.id] = idea.status;
        });
        setSelectedStatuses(prev => ({ ...prev, ...statusUpdates }));
        
        // Fetch user profiles for idea creators
        const uniqueUserIds = [...new Set(ideasData.map(idea => idea.createdBy).filter(Boolean))];
        fetchUserProfiles(uniqueUserIds);
        
        // Don't automatically update development periods here - let translation handle it
      }, (error) => {
        console.error("Error listening to project ideas:", error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up project ideas listener:", error);
      setLoading(false);
      return () => {};
    }
  }, [projectId]);

  // Function to fetch user profiles
  const fetchUserProfiles = async (userIds: string[]) => {
    const profiles: Record<string, { nickname: string; avatar: string }> = {};
    
    for (const userId of userIds) {
      if (userId && !userProfiles[userId]) {
        try {
          // Fetch public profile data from userProfiles collection
          const userProfileDoc = await getDoc(doc(db, "userProfiles", userId));
          // Fetch private data from users collection for fallback displayName
          const userDoc = await getDoc(doc(db, "users", userId));
          
          let nickname = 'Unknown User';
          let photoURL = '';
          
          if (userProfileDoc.exists()) {
            const profileData = userProfileDoc.data();
            nickname = profileData.nickname || nickname;
            photoURL = profileData.photoURL || '';
          }
          
          // Fallback to displayName from users collection if no nickname
          if (nickname === 'Unknown User' && userDoc.exists()) {
            const userData = userDoc.data();
            nickname = userData.displayName || 'Unknown User';
          }
          
          profiles[userId] = {
            nickname,
            avatar: photoURL
          };
        } catch (error) {
          console.error(`Error fetching user profile for ${userId}:`, error);
          profiles[userId] = {
            nickname: 'Unknown User',
            avatar: ''
          };
        }
      }
    }
    
    if (Object.keys(profiles).length > 0) {
      setUserProfiles(prev => ({ ...prev, ...profiles }));
    }
  };

  // Safe automatic translation on page load and language change
  useEffect(() => {
    if (ideas.length > 0) {
      
      // Use the same direct translation approach that worked with the manual button
      const runSafeAutoTranslation = async () => {
        try {
          let translationCount = 0;
          
          for (const idea of ideas) {
            // Check if idea needs translation (title, content, or staff comment)
            const existingTranslation = idea.translations?.[translationLang];
            let needsTranslation = false;
            let missingParts = [];
            
            // Skip if this is the original language (unless checking staff comment separately)
            if (idea.originalLang !== translationLang) {
              // Different language - check title and content
              if (!existingTranslation?.title) {
                needsTranslation = true;
                missingParts.push('title');
              }
              if (!existingTranslation?.content) {
                needsTranslation = true;
                missingParts.push('content');
              }
            }
            
            // Always check staff comment separately (can be in different language from original)
            if (idea.staffComment) {
              // Check the original staff comment language
              const originalStaffCommentIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(idea.staffComment.trim());
              const originalStaffCommentIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(idea.staffComment.trim());
              
              // Check if we need translation based on original staff comment language vs target language
              const needsStaffCommentTranslation = 
                (translationLang === 'ja' && originalStaffCommentIsEnglish && !originalStaffCommentIsJapanese) ||
                (translationLang === 'en' && originalStaffCommentIsJapanese && !originalStaffCommentIsEnglish);
              
              if (needsStaffCommentTranslation) {
                // Check if translation already exists and is correct
                if (!existingTranslation?.staffComment) {
                  needsTranslation = true;
                  missingParts.push('staffComment');
                } else {
                  // Check if existing translation is in the correct language
                  const translatedIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(existingTranslation.staffComment.trim());
                  const translatedIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(existingTranslation.staffComment.trim());
                  
                  const translationIsCorrect = 
                    (translationLang === 'ja' && translatedIsJapanese) ||
                    (translationLang === 'en' && translatedIsEnglish);
                  
                  if (!translationIsCorrect) {
                    needsTranslation = true;
                    missingParts.push('staffComment (incorrect translation)');
                  }
                }
              }
            }
            
            // Always check development period separately (can be in different language from original)
            if (idea.developmentPeriod) {
              // Check the original development period language
              const originalPeriodIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(idea.developmentPeriod.trim());
              const originalPeriodIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(idea.developmentPeriod.trim());
              
              // Check if we need translation based on original development period language vs target language
              const needsPeriodTranslation = 
                (translationLang === 'ja' && originalPeriodIsEnglish && !originalPeriodIsJapanese) ||
                (translationLang === 'en' && originalPeriodIsJapanese && !originalPeriodIsEnglish);
              
              if (needsPeriodTranslation) {
                // Check if translation already exists and is correct
                if (!(existingTranslation as any)?.developmentPeriod) {
                  needsTranslation = true;
                  missingParts.push('developmentPeriod');
                } else {
                  // Check if existing translation is in the correct language
                  const translatedIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test((existingTranslation as any).developmentPeriod.trim());
                  const translatedIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test((existingTranslation as any).developmentPeriod.trim());
                  
                  const translationIsCorrect = 
                    (translationLang === 'ja' && translatedIsJapanese) ||
                    (translationLang === 'en' && translatedIsEnglish);
                  
                  if (!translationIsCorrect) {
                    needsTranslation = true;
                    missingParts.push('developmentPeriod (incorrect translation)');
                  }
                }
              }
            }
            
            if (needsTranslation) {
              try {
                const { translateText } = await import('../translation');
                const translationData: any = {};
                
                // Translate title if needed
                if (missingParts.includes('title')) {
                  const translatedTitle = await translateText(idea.title, translationLang);
                  if (translatedTitle && translatedTitle !== idea.title) {
                    translationData.title = translatedTitle;
                  }
                }
                
                // Translate content if needed
                if (missingParts.includes('content')) {
                  const translatedContent = await translateText(idea.content, translationLang);
                  if (translatedContent && translatedContent !== idea.content) {
                    translationData.content = translatedContent;
                  }
                }
                
                // Translate staff comment if needed
                if (missingParts.some(part => part.includes('staffComment'))) {
                  const translatedComment = await translateText(idea.staffComment, translationLang);
                  if (translatedComment && translatedComment !== idea.staffComment) {
                    translationData.staffComment = translatedComment;
                  }
                }
                
                // Translate development period if needed
                if (missingParts.some(part => part.includes('developmentPeriod'))) {
                  const translatedPeriod = await translateText(idea.developmentPeriod, translationLang);
                  if (translatedPeriod && translatedPeriod !== idea.developmentPeriod) {
                    translationData.developmentPeriod = translatedPeriod;
                  }
                }
                
                // Save translation to Firestore if we have any translations
                if (Object.keys(translationData).length > 0) {
                  // Preserve existing translations
                  const fullTranslationData = {
                    ...existingTranslation,
                    ...translationData
                  };
                  
                  await updateDoc(doc(db, "projectIdeas", idea.id), {
                    [`translations.${translationLang}`]: fullTranslationData
                  });
                  
                  translationCount++;
                  
                  // Small delay between translations to avoid overwhelming the API
                  if (translationCount < 5) { // Limit to 5 translations per load
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  } else {
                    break;
                  }
                }
              } catch (error) {
                console.error(`Auto-translation failed for idea ${idea.id}:`, error);
              }
            }
          }
          
          if (translationCount > 0) {
            setRefreshCounter(prev => prev + 1);
          }
        } catch (error) {
          console.error("Auto-translation failed:", error);
        }
      };
      
      // Add a delay to prevent rapid re-execution and let Firestore data settle
      const timeoutId = setTimeout(() => {
        runSafeAutoTranslation();
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [ideas, translationLang]);

  // Reset input field editing states when translation language changes
  useEffect(() => {
    // Only clear editing states when language changes, preserve manual values
    setEditingPeriods({});
    setEditingComments({});
    // Force re-render to show updated translations
    setTimeout(() => {
      setRefreshCounter(prev => prev + 1);
    }, 100);
  }, [translationLang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectId || !formData.title.trim() || !formData.content.trim()) {
      return;
    }
    
    try {
      if (editingIdea) {
        // Detect language of the updated content
        const detectedLang = await detectLanguage(formData.content);
        
        const updateData = {
          title: formData.title,
          content: formData.content,
          updatedAt: serverTimestamp(),
          originalLang: detectedLang || lang
        };
        
        // Update translations for all existing languages
        const translationUpdates: any = {};
        
        // Update the original language translation
        translationUpdates[`translations.${detectedLang || lang}`] = {
          title: formData.title,
          content: formData.content,
          // Preserve existing staff comment and development period if they exist
          ...(editingIdea.translations?.[detectedLang || lang]?.staffComment && { staffComment: editingIdea.translations[detectedLang || lang].staffComment }),
          ...(editingIdea.translations?.[detectedLang || lang]?.developmentPeriod && { developmentPeriod: editingIdea.translations[detectedLang || lang].developmentPeriod })
        };
        
        // Clear other language translations since content changed
        if (editingIdea.translations) {
          Object.keys(editingIdea.translations).forEach(langKey => {
            if (langKey !== (detectedLang || lang)) {
              translationUpdates[`translations.${langKey}`] = null;
            }
          });
        }
        
        await updateDoc(doc(db, "projectIdeas", editingIdea.id), {
          ...updateData,
          ...translationUpdates
        });
      } else {
        
        // Detect language of the content
        const detectedLang = await detectLanguage(formData.content);
        
        const docData = {
          title: formData.title,
          content: formData.content,
          status: 'unconfirmed' as const,
          createdBy: user.uid,
          projectId: projectId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          originalLang: detectedLang || lang
        };

        // Only add translations field if we have translations to add
        if (detectedLang === lang) {
          (docData as any).translations = { [lang]: { title: formData.title, content: formData.content } };
        }

        await addDoc(collection(db, "projectIdeas"), docData);
      }

      setFormData({ title: "", content: "" });
      setShowForm(false);
      setEditingIdea(null);
    } catch (error) {
      console.error("Error saving project idea:", error);
      
      let errorMessage = t("saveIdeaError");
      if (error.code === 'permission-denied') {
        errorMessage = t("permissionDeniedIdea");
      } else if (error.message) {
        errorMessage += ": " + error.message;
      }
      
      alert(errorMessage);
    }
  };

  const handleEdit = (idea: ProjectIdeaData) => {
    setEditingIdea(idea);
    setFormData({
      title: idea.title,
      content: idea.content
    });
    setShowForm(true);
  };

  const handleDeleteClick = useCallback((ideaId: string) => {
    setIdeaToDelete(ideaId);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!ideaToDelete) return;

    try {
      await deleteDoc(doc(db, "projectIdeas", ideaToDelete));
      setDeleteConfirmOpen(false);
      setIdeaToDelete(null);
    } catch (error) {
      console.error("Error deleting project idea:", error);
      setDeleteConfirmOpen(false);
      setIdeaToDelete(null);
    }
  }, [ideaToDelete]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmOpen(false);
    setIdeaToDelete(null);
  }, []);

  const handleStatusUpdate = async (ideaId: string, status: IdeaStatus, comment: string, period: string) => {
    try {
      // Check user role directly from Firestore
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        
        if (!userDoc.exists()) {
          alert("ユーザードキュメントがFirestoreに存在しません。管理者に連絡してください。");
          return;
        }
        
        if (!userData || (userData.role !== 'staff' && userData.role !== 'admin')) {
          alert(`権限エラー: 運営操作には'staff'または'admin'ロールが必要です。現在のロール: ${userData?.role || 'undefined'}`);
          return;
        }
        
      } catch (roleError) {
        console.error("Failed to fetch user role:", roleError);
        alert("ユーザーロールの確認に失敗しました: " + roleError.message);
        return;
      }
      
      const basicUpdateData = {
        status,
        staffComment: comment,
        developmentPeriod: period,
        updatedAt: serverTimestamp()
      };
      
      try {
        await updateDoc(doc(db, "projectIdeas", ideaId), basicUpdateData);
        
        // Update the selected status and development period to reflect the change
        setSelectedStatusForIdea(ideaId, status);
        setDevelopmentPeriodForIdea(ideaId, period);
        
        // Force immediate translation check for development period if it was updated
        if (period.trim()) {
          setTimeout(() => {
            setRefreshCounter(prev => prev + 1);
          }, 500);
        }
        
        // Update translations for current language immediately
        const idea = ideas.find(i => i.id === ideaId);
        if (idea?.translations && comment.trim()) {
          const translationUpdateData = {
            [`translations.${lang}.staffComment`]: comment
          };
          
          await updateDoc(doc(db, "projectIdeas", ideaId), translationUpdateData);
        }
        
        // Update all existing translation languages with the new comment
        if (idea?.translations && comment.trim()) {
          const existingLangs = Object.keys(idea.translations);
          
          for (const existingLang of existingLangs) {
            if (existingLang !== lang) {
              // Don't overwrite, just ensure the original language has the new comment
              if (existingLang === idea.originalLang) {
                const originalLangUpdate = {
                  [`translations.${existingLang}.staffComment`]: comment
                };
                await updateDoc(doc(db, "projectIdeas", ideaId), originalLangUpdate);
              }
            }
          }
        }
        
        // Auto-translate the staff comment and development period to ALL languages
        if (comment.trim() || period.trim()) {
          clearTranslationCache(ideaId);
          
          setTimeout(async () => {
            const ideaToUpdate = ideas.find(i => i.id === ideaId);
            
            // Detect the language of the new content
            let contentOriginalLang = ideaToUpdate?.originalLang || 'ja';
            
            // If staff comment is being updated, detect its language
            if (comment.trim()) {
              const commentIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(comment.trim());
              const commentIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(comment.trim());
              
              if (commentIsEnglish && !commentIsJapanese) {
                contentOriginalLang = 'en';
              } else if (commentIsJapanese) {
                contentOriginalLang = 'ja';
              }
            }
            
            // If development period is being updated, detect its language
            if (period.trim()) {
              const periodIsEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(period.trim());
              const periodIsJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(period.trim());
              
              if (periodIsEnglish && !periodIsJapanese) {
                contentOriginalLang = 'en';
              } else if (periodIsJapanese) {
                contentOriginalLang = 'ja';
              }
            }
            
            const updatedIdea = {
              ...ideaToUpdate,
              staffComment: comment,
              developmentPeriod: period,
              // Don't change originalLang - preserve the original idea's language
              translations: ideaToUpdate?.translations || {} // Preserve existing translations
            };
            
            try {
              await translateStaffCommentToAllLanguages(updatedIdea as ProjectIdeaData);
              setRefreshCounter(prev => prev + 1);
            } catch (error) {
              console.error("Multi-language translation failed:", error);
            }
          }, 2000);
        }
        
      } catch (basicError) {
        console.error("Basic update failed:", basicError);
        throw basicError;
      }
      
      // Clear editing states for this idea
      setEditingComments(prev => ({ ...prev, [ideaId]: false }));
      setEditingPeriods(prev => ({ ...prev, [ideaId]: false }));
      
    } catch (error) {
      console.error("Error updating status:", error);
      alert(`エラーが発生しました: ${error.message}`);
    }
  };

  const canEditIdea = (idea: ProjectIdeaData) => {
    const projectRole = getProjectUserRole();
    return projectRole === 'admin' || idea.createdBy === user.uid;
  };

  const canDeleteIdea = (idea: ProjectIdeaData) => {
    const projectRole = getProjectUserRole();
    return projectRole === 'admin' || idea.createdBy === user.uid;
  };

  const canManageStatus = () => {
    const projectRole = getProjectUserRole();
    return projectRole === 'admin' || projectRole === 'staff';
  };

  // Get selected status for a specific idea (defaults to current idea status)
  const getSelectedStatus = (ideaId: string, currentStatus: IdeaStatus): IdeaStatus => {
    return selectedStatuses[ideaId] ?? currentStatus;
  };

  // Set selected status for a specific idea
  const setSelectedStatusForIdea = (ideaId: string, status: IdeaStatus) => {
    setSelectedStatuses(prev => ({ ...prev, [ideaId]: status }));
  };

  // Get development period for a specific idea
  const getDevelopmentPeriod = (ideaId: string, translatedContent: any, originalPeriod?: string): string => {
    // If user is currently editing this field, use the editing value
    if (editingPeriods[ideaId] && developmentPeriods[ideaId] !== undefined) {
      return developmentPeriods[ideaId];
    }
    
    // If we have manual value but not editing (e.g., after form submission), use manual value
    if (developmentPeriods[ideaId] !== undefined && !editingPeriods[ideaId]) {
      return developmentPeriods[ideaId];
    }
    
    // Otherwise, use translated content if available, then original value
    return translatedContent.developmentPeriod || originalPeriod || '';
  };

  // Get staff comment for a specific idea
  const getStaffComment = (ideaId: string, translatedContent: any, originalComment?: string): string => {
    // If user is currently editing this field, use the editing value
    if (editingComments[ideaId] && staffComments[ideaId] !== undefined) {
      return staffComments[ideaId];
    }
    
    // If we have manual value but not editing (e.g., after form submission), use manual value
    if (staffComments[ideaId] !== undefined && !editingComments[ideaId]) {
      return staffComments[ideaId];
    }
    
    // Otherwise, use translated content if available, then original value
    return translatedContent.staffComment || originalComment || '';
  };

  // Set development period for a specific idea
  const setDevelopmentPeriodForIdea = (ideaId: string, period: string) => {
    setDevelopmentPeriods(prev => ({ ...prev, [ideaId]: period }));
    setEditingPeriods(prev => ({ ...prev, [ideaId]: true }));
  };

  // Set staff comment for a specific idea
  const setStaffCommentForIdea = (ideaId: string, comment: string) => {
    setStaffComments(prev => ({ ...prev, [ideaId]: comment }));
    setEditingComments(prev => ({ ...prev, [ideaId]: true }));
  };

  // Start editing a development period field
  const startEditingPeriod = (ideaId: string, currentValue: string) => {
    setDevelopmentPeriods(prev => ({ ...prev, [ideaId]: currentValue }));
    setEditingPeriods(prev => ({ ...prev, [ideaId]: true }));
  };

  // Stop editing a development period field
  const stopEditingPeriod = (ideaId: string) => {
    setEditingPeriods(prev => ({ ...prev, [ideaId]: false }));
  };

  // Start editing a staff comment field
  const startEditingComment = (ideaId: string, currentValue: string) => {
    setStaffComments(prev => ({ ...prev, [ideaId]: currentValue }));
    setEditingComments(prev => ({ ...prev, [ideaId]: true }));
  };

  // Stop editing a staff comment field
  const stopEditingComment = (ideaId: string) => {
    setEditingComments(prev => ({ ...prev, [ideaId]: false }));
  };

  // Get localized text for UI elements (only Japanese/English based on user's language preference)
  const getLocalizedText = (key: string): string => {
    // Simple translation map for common terms - only Japanese and English for UI
    const translations: Record<string, Record<string, string>> = {
      'developmentPeriod': {
        'en': 'Development Period:',
        'ja': '開発期間:'
      },
      'adminComment': {
        'en': 'Admin Comment',
        'ja': '運営コメント'
      },
      'adminJudgment': {
        'en': 'Admin Judgment',
        'ja': '運営判定'
      },
      'lastUpdated': {
        'en': 'Last Updated:',
        'ja': '最終更新:'
      },
      'postedAt': {
        'en': 'Posted:',
        'ja': '投稿日:'
      }
    };
    
    // Use UI language (lang) instead of translation language for UI elements
    return translations[key]?.[lang] || t(key);
  };

  const getStatusText = (status: IdeaStatus) => {
    switch (status) {
      case 'unconfirmed': return t('unconfirmed');
      case 'pending': return t('pending');
      case 'approved': return t('approved');
      case 'rejected': return t('rejected');
      default: return status;
    }
  };

  // CSV download function
  const downloadCSV = () => {
    if (ideas.length === 0) {
      alert(t('noDataToExport') || 'No data to export');
      return;
    }

    // CSV headers
    const headers = [
      'ID',
      'Nickname',
      'Title',
      'Content', 
      'Status',
      'Created By',
      'Created At',
      'Updated At',
      'Staff Comment',
      'Development Period',
      'Original Language'
    ];

    // Convert ideas to CSV rows
    const csvRows = ideas.map(idea => {
      const translatedContent = getTranslatedContent(idea);
      return [
        idea.id,
        `"${userProfiles[idea.createdBy]?.nickname || 'Unknown User'}"`,
        `"${(translatedContent.title || '').replace(/"/g, '""')}"`,
        `"${(translatedContent.content || '').replace(/"/g, '""')}"`,
        getStatusText(idea.status),
        idea.createdBy || '',
        `"${formatDate(idea.createdAt, true) || ''}"`,
        `"${formatDate(idea.updatedAt, true) || ''}"`,
        `"${(translatedContent.staffComment || '').replace(/"/g, '""')}"`,
        `"${(translatedContent.developmentPeriod || '').replace(/"/g, '""')}"`,
        idea.originalLang || ''
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // Add BOM for Excel compatibility with Japanese characters
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;

    // Create and download file
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const projectName = project?.name || 'project';
      const timestamp = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `${projectName}_ideas_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getStatusColor = (status: IdeaStatus) => {
    switch (status) {
      case 'unconfirmed': return '#6c757d';
      case 'pending': return '#ffc107';
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div>{t("loading")}</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/projects" style={{ textDecoration: 'none', color: '#6e283c' }}>
          {t("backToProjects")}
        </Link>
        <div style={{ margin: '0.5rem 0' }}>
          <h1 style={{ margin: 0 }}>
            {project?.name || t("project")}
          </h1>
        </div>
        {project?.description && (
          <p style={{ color: '#666', margin: '0.5rem 0 1rem 0' }}>
            {project.description}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {hasProjectAccess() && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {t("newIdea")}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              onClick={downloadCSV}
              style={{
                display: 'inline-block',
                position: 'relative'
              }}
              title={lang === 'en' ? 'Download CSV' : 'CSV ダウンロード'}
            >
              <IconDownload />
            </div>
            <select 
            value={translationLang} 
            onChange={(e) => {
              const newLang = e.target.value;
              setTranslationLang(newLang);
              console.log(`Translation language changed to: ${newLang}`);
            }} 
            style={{ 
              height: 32, 
              fontSize: "1rem", 
              borderRadius: 12, 
              border: "1px solid #ccc", 
              padding: "0 8px",
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {[
              ["en", "English"],
              ["ja", "日本語"],
              ["zh", "中文"],
              ["ko", "한국어"],
              ["es", "Español"],
              ["fr", "Français"],
            ].map(([code, label]) => (
              <option key={code} value={code as string}>
                {label}
              </option>
            ))}
          </select>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px'
          }}>
            <h2>{editingIdea ? t("editIdea") : t("newIdea")}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {t("title")} *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {t("ideaContent")} *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {editingIdea ? t("update") : t("post")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingIdea(null);
                    setFormData({ title: "", content: "" });
                  }}
                  style={{
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ideas List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {ideas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#666', border: '2px dashed #ddd', borderRadius: '8px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
            <h3>{t("noIdeas")}</h3>
            <p>{t("postFirstIdea")}</p>
          </div>
        ) : (
          ideas.map((idea) => {
            const translatedContent = getTranslatedContent(idea);
            // Force re-evaluation when refreshCounter changes
            const _refreshTrigger = refreshCounter;
            return (
            <div
              key={idea.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#f9f9f9',
                position: 'relative'
              }}
            >
              {isTranslating(idea.id) && (
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  fontSize: '0.8rem',
                  color: '#666',
                  fontStyle: 'italic'
                }}>
                  翻訳中...
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, color: '#333' }}>{translatedContent.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {userProfiles[idea.createdBy]?.avatar ? (
                      <img 
                        src={userProfiles[idea.createdBy].avatar} 
                        alt="Avatar"
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          background: '#eee'
                        }}
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23ddd'/%3e%3ctext x='50' y='50' font-size='40' text-anchor='middle' dy='.3em' fill='%23999'%3e?</text%3e%3c/svg%3e";
                        }}
                      />
                    ) : (
                      <img 
                        src={"data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23ddd'/%3e%3ctext x='50' y='50' font-size='40' text-anchor='middle' dy='.3em' fill='%23999'%3e" + (userProfiles[idea.createdBy]?.nickname?.[0]?.toUpperCase() || '?') + "%3c/text%3e%3c/svg%3e"}
                        alt="Default Avatar"
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: '#eee'
                        }}
                      />
                    )}
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>
                      {userProfiles[idea.createdBy]?.nickname || 'Loading...'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {canEditIdea(idea) && (
                    <button
                      onClick={() => handleEdit(idea)}
                      style={{
                        backgroundColor: '#ffc107',
                        color: 'black',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {t("edit")}
                    </button>
                  )}
                  {canDeleteIdea(idea) && (
                    <button
                      onClick={() => handleDeleteClick(idea.id)}
                      style={{
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {t("delete")}
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ marginBottom: '0.25rem' }}>
                  <strong style={{ color: '#6e283c' }}>{getLocalizedText("postedAt")}</strong> <span style={{ color: '#666' }}>{formatDate(idea.createdAt) || t("unknown")}</span>
                </div>
                {idea.updatedAt && idea.updatedAt !== idea.createdAt && (
                  <div style={{ fontSize: '0.9rem' }}>
                    <strong style={{ color: '#6e283c' }}>{getLocalizedText("lastUpdated")}</strong> <span style={{ color: '#666' }}>{formatDate(idea.updatedAt) || t("unknown")}</span>
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: '#6e283c' }}>{t("content")}:</strong><br />
                <span style={{ color: '#333' }}>{translatedContent.content}</span>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ color: '#6e283c' }}>{getLocalizedText("adminJudgment")}</strong>{' '}
                <span
                  style={{
                    backgroundColor: getStatusColor(idea.status),
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem'
                  }}
                >
                  {getStatusText(idea.status)}
                </span>
              </div>
              
              {translatedContent.staffComment && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#6e283c' }}>{getLocalizedText("adminComment")}</strong><br />
                      <span style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{translatedContent.staffComment}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {translatedContent.developmentPeriod && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong style={{ color: '#6e283c' }}>{getLocalizedText("developmentPeriod")}</strong> <span style={{ color: '#333' }}>{translatedContent.developmentPeriod}</span>
                </div>
              )}
              
{canManageStatus() && (
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#6e283c' }}>{t("adminOperations")}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select
                      value={getSelectedStatus(idea.id, idea.status)}
                      onChange={(e) => setSelectedStatusForIdea(idea.id, e.target.value as IdeaStatus)}
                      style={{
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    >
                      <option value="unconfirmed">{t("unconfirmed")}</option>
                      <option value="pending">{t("pending")}</option>
                      <option value="approved">{t("approved")}</option>
                      <option value="rejected">{t("rejected")}</option>
                    </select>
                    <textarea
                      value={getStaffComment(idea.id, translatedContent, idea.staffComment)}
                      onChange={(e) => setStaffCommentForIdea(idea.id, e.target.value)}
                      onFocus={() => startEditingComment(idea.id, getStaffComment(idea.id, translatedContent, idea.staffComment))}
                      onBlur={() => stopEditingComment(idea.id)}
                      placeholder={t("adminCommentPlaceholder")}
                      style={{
                        flex: 1,
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd',
                        minHeight: '2.5rem',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        fontSize: 'inherit'
                      }}
                      key={`${idea.id}-comment-${translationLang}-${refreshCounter}`}
                    />
                    <input
                      type="text"
                      value={getDevelopmentPeriod(idea.id, translatedContent, idea.developmentPeriod)}
                      onChange={(e) => setDevelopmentPeriodForIdea(idea.id, e.target.value)}
                      onFocus={() => startEditingPeriod(idea.id, getDevelopmentPeriod(idea.id, translatedContent, idea.developmentPeriod))}
                      onBlur={() => stopEditingPeriod(idea.id)}
                      placeholder={t("developmentPeriodPlaceholder")}
                      key={`${idea.id}-period-${translationLang}-${refreshCounter}`}
                      style={{
                        width: '100px',
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    />
                    <button
                      onClick={() => {
                        const currentSelectedStatus = getSelectedStatus(idea.id, idea.status);
                        const currentStaffComment = getStaffComment(idea.id, translatedContent, idea.staffComment);
                        const currentDevelopmentPeriod = getDevelopmentPeriod(idea.id, translatedContent, idea.developmentPeriod);
                        handleStatusUpdate(idea.id, currentSelectedStatus, currentStaffComment, currentDevelopmentPeriod);
                      }}
                      style={{
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {t("update")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirmOpen}
        title={t("deleteIdeaTitle")}
        message={t("deleteIdeaMessage")}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        confirmText={t("deleteButton")}
        cancelText={t("cancelButton")}
      />
    </div>
  );
};

export default ProjectIdeas;