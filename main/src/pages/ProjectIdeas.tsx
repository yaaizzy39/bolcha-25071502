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
// @ts-ignore - TypeScript issue with where import
import { where } from "firebase/firestore";
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
import TranslationLoadingIcon from "../components/TranslationLoadingIcon";

// Like and Dislike icon components
function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "#e0245e" : "none"}
      stroke={filled ? "#e0245e" : "#666"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "text-bottom" }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function DislikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "#657786" : "none"}
      stroke={filled ? "#657786" : "#666"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "text-bottom" }}
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

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
  const [hoveredIdea, setHoveredIdea] = useState<string | null>(null);
  
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
    if (userRole === 'staff') return 'staff';
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
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ideasData: ProjectIdeaData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as ProjectIdeaData;
          ideasData.push({
            id: doc.id,
            ...data
          });
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
  const [translatedIdeasSet, setTranslatedIdeasSet] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    if (ideas.length > 0 && translationLang) {
      const runSafeAutoTranslation = async () => {
        try {
          let translationCount = 0;
          const newTranslatedIds = new Set(translatedIdeasSet);
          
          for (const idea of ideas) {
            // Skip if already processed for this language
            const ideaKey = `${idea.id}-${translationLang}`;
            if (newTranslatedIds.has(ideaKey)) {
              continue;
            }
            
            // Check if idea needs translation
            const existingTranslation = idea.translations?.[translationLang];
            let needsTranslation = false;
            let missingParts = [];
            
            // Only translate if target language is different from original
            if (idea.originalLang !== translationLang) {
              if (!existingTranslation?.title) {
                needsTranslation = true;
                missingParts.push('title');
              }
              if (!existingTranslation?.content) {
                needsTranslation = true;
                missingParts.push('content');
              }
            }
            
            // Check staff comment separately
            if (idea.staffComment && !existingTranslation?.staffComment) {
              const isStaffCommentInTargetLang = translationLang === 'ja' 
                ? /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(idea.staffComment)
                : /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(idea.staffComment);
              
              if (!isStaffCommentInTargetLang) {
                needsTranslation = true;
                missingParts.push('staffComment');
              }
            }
            
            if (needsTranslation && translationCount < 3) { // Limit to 3 translations per batch
              try {
                const { translateText } = await import('../translation');
                const translationData: any = {};
                
                if (missingParts.includes('title')) {
                  const translatedTitle = await translateText(idea.title, translationLang);
                  if (translatedTitle && translatedTitle !== idea.title) {
                    translationData.title = translatedTitle;
                  }
                }
                
                if (missingParts.includes('content')) {
                  const translatedContent = await translateText(idea.content, translationLang);
                  if (translatedContent && translatedContent !== idea.content) {
                    translationData.content = translatedContent;
                  }
                }
                
                if (missingParts.includes('staffComment')) {
                  const translatedComment = await translateText(idea.staffComment, translationLang);
                  if (translatedComment && translatedComment !== idea.staffComment) {
                    translationData.staffComment = translatedComment;
                  }
                }
                
                if (Object.keys(translationData).length > 0) {
                  const fullTranslationData = {
                    ...existingTranslation,
                    ...translationData
                  };
                  
                  try {
                    await updateDoc(doc(db, "projectIdeas", idea.id), {
                      [`translations.${translationLang}`]: fullTranslationData
                    });
                    
                    newTranslatedIds.add(ideaKey);
                    translationCount++;
                    
                    // Short delay between translations
                    if (translationCount < 3) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  } catch (firestoreError: any) {
                    if (firestoreError.code === 'permission-denied') {
                      // Mark as processed to avoid repeated attempts
                      newTranslatedIds.add(ideaKey);
                      break;
                    }
                    console.error(`Firestore update failed for idea ${idea.id}:`, firestoreError);
                  }
                }
              } catch (error) {
                console.error(`Auto-translation failed for idea ${idea.id}:`, error);
                // Mark as processed even on error to avoid infinite retry
                newTranslatedIds.add(ideaKey);
              }
            } else {
              // Mark as processed if no translation needed
              newTranslatedIds.add(ideaKey);
            }
          }
          
          setTranslatedIdeasSet(newTranslatedIds);
        } catch (error) {
          console.error("Auto-translation failed:", error);
        }
      };
      
      // Delay execution to prevent rapid re-execution
      const timeoutId = setTimeout(() => {
        runSafeAutoTranslation();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [ideas, translationLang]); // Remove refreshCounter from dependencies

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

  // Handle like/dislike actions
  const handleLike = async (ideaId: string) => {
    try {
      const ideaRef = doc(db, "projectIdeas", ideaId);
      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) return;

      const currentLikes = idea.likes || [];
      const currentDislikes = idea.dislikes || [];
      const hasLiked = currentLikes.includes(user.uid);
      
      let newLikes: string[];
      let newDislikes = currentDislikes.filter(uid => uid !== user.uid); // Remove from dislikes
      
      if (hasLiked) {
        // Remove like
        newLikes = currentLikes.filter(uid => uid !== user.uid);
      } else {
        // Add like
        newLikes = [...currentLikes, user.uid];
      }

      await updateDoc(ideaRef, {
        likes: newLikes,
        dislikes: newDislikes
      });
    } catch (error) {
      console.error("Error updating like:", error);
    }
  };

  const handleDislike = async (ideaId: string) => {
    try {
      const ideaRef = doc(db, "projectIdeas", ideaId);
      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) return;

      const currentLikes = idea.likes || [];
      const currentDislikes = idea.dislikes || [];
      const hasDisliked = currentDislikes.includes(user.uid);
      
      let newDislikes: string[];
      let newLikes = currentLikes.filter(uid => uid !== user.uid); // Remove from likes
      
      if (hasDisliked) {
        // Remove dislike
        newDislikes = currentDislikes.filter(uid => uid !== user.uid);
      } else {
        // Add dislike
        newDislikes = [...currentDislikes, user.uid];
      }

      await updateDoc(ideaRef, {
        likes: newLikes,
        dislikes: newDislikes
      });
    } catch (error) {
      console.error("Error updating dislike:", error);
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
        'en': 'Management Judgment',
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
      'Original Title',
      'Original Content',
      'Status',
      'Created By',
      'Created At',
      'Updated At',
      'Staff Comment',
      'Development Period',
      'Original Language',
      'Likes Count',
      'Dislikes Count'
    ];

    // Convert ideas to CSV rows
    const csvRows = ideas.map(idea => {
      const translatedContent = getTranslatedContent(idea);
      return [
        idea.id,
        `"${userProfiles[idea.createdBy]?.nickname || 'Unknown User'}"`,
        `"${(translatedContent.title || '').replace(/"/g, '""')}"`,
        `"${(translatedContent.content || '').replace(/"/g, '""')}"`,
        `"${(idea.title || '').replace(/"/g, '""')}"`,
        `"${(idea.content || '').replace(/"/g, '""')}"`,
        getStatusText(idea.status),
        idea.createdBy || '',
        `"${formatDate(idea.createdAt, true) || ''}"`,
        `"${formatDate(idea.updatedAt, true) || ''}"`,
        `"${(translatedContent.staffComment || '').replace(/"/g, '""')}"`,
        `"${(translatedContent.developmentPeriod || '').replace(/"/g, '""')}"`,
        idea.originalLang || '',
        (idea.likes || []).length,
        (idea.dislikes || []).length
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
              onMouseEnter={() => setHoveredIdea(idea.id)}
              onMouseLeave={() => setHoveredIdea(null)}
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
                  <h3 style={{ margin: 0, color: '#333' }}>
                    {translatedContent.title}
                    {isTranslating(idea.id) && <TranslationLoadingIcon />}
                  </h3>
                  {prefs.showOriginal && translatedContent.title !== idea.title && (
                    <div style={{ fontSize: "0.8em", color: "#666", fontWeight: "normal", marginTop: "0.25rem" }}>{idea.title}</div>
                  )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <div>
                    <strong style={{ color: '#6e283c' }}>{getLocalizedText("postedAt")}</strong> <span style={{ color: '#666' }}>{formatDate(idea.createdAt) || t("unknown")}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Like button */}
                    <span
                      onClick={() => handleLike(idea.id)}
                      style={{
                        cursor: "pointer",
                        fontSize: "0.9em",
                        color: (idea.likes ?? []).includes(user.uid) ? "#e0245e" : "#888",
                        opacity: (idea.likes && idea.likes.length > 0) || hoveredIdea === idea.id ? 1 : 0,
                        pointerEvents: "auto",
                        transition: "opacity 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <LikeIcon filled={(idea.likes ?? []).includes(user.uid)} />
                      {idea.likes && idea.likes.length > 0 && (
                        <span style={{ fontSize: "0.8em", color: "#555" }}>{idea.likes.length}</span>
                      )}
                    </span>
                    {/* Dislike button */}
                    <span
                      onClick={() => handleDislike(idea.id)}
                      style={{
                        cursor: "pointer",
                        fontSize: "0.9em",
                        color: (idea.dislikes ?? []).includes(user.uid) ? "#657786" : "#888",
                        opacity: (idea.dislikes && idea.dislikes.length > 0) || hoveredIdea === idea.id ? 1 : 0,
                        pointerEvents: "auto",
                        transition: "opacity 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <DislikeIcon filled={(idea.dislikes ?? []).includes(user.uid)} />
                      {idea.dislikes && idea.dislikes.length > 0 && (
                        <span style={{ fontSize: "0.8em", color: "#555" }}>{idea.dislikes.length}</span>
                      )}
                    </span>
                  </div>
                </div>
                {idea.updatedAt && idea.updatedAt !== idea.createdAt && (
                  <div style={{ fontSize: '0.9rem' }}>
                    <strong style={{ color: '#6e283c' }}>{getLocalizedText("lastUpdated")}</strong> <span style={{ color: '#666' }}>{formatDate(idea.updatedAt) || t("unknown")}</span>
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: '#6e283c' }}>{t("content")}:</strong><br />
                <span style={{ color: '#333' }}>
                  {translatedContent.content}
                  {isTranslating(idea.id) && <TranslationLoadingIcon />}
                </span>
                {prefs.showOriginal && translatedContent.content !== idea.content && (
                  <div style={{ fontSize: "0.8em", color: "#666", whiteSpace: "pre-wrap", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #eee" }}>{idea.content}</div>
                )}
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
                      {prefs.showOriginal && translatedContent.staffComment !== idea.staffComment && idea.staffComment && (
                        <div style={{ fontSize: "0.8em", color: "#666", whiteSpace: "pre-wrap", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #eee" }}>{idea.staffComment}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {translatedContent.developmentPeriod && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong style={{ color: '#6e283c' }}>{getLocalizedText("developmentPeriod")}</strong> <span style={{ color: '#333' }}>{translatedContent.developmentPeriod}</span>
                  {prefs.showOriginal && translatedContent.developmentPeriod !== idea.developmentPeriod && idea.developmentPeriod && (
                    <div style={{ fontSize: "0.8em", color: "#666", marginTop: "0.25rem" }}>{idea.developmentPeriod}</div>
                  )}
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