import { useEffect, useState } from "react";
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
import { detectLanguage } from "../langDetect";

interface ProjectIdeasProps {
  user: User;
}

const ProjectIdeas = ({ user }: ProjectIdeasProps) => {
  const { t, lang } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const [ideas, setIdeas] = useState<ProjectIdeaData[]>([]);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ProjectIdeaData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: ""
  });
  const [staffComment, setStaffComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<IdeaStatus>('unconfirmed');
  const [developmentPeriod, setDevelopmentPeriod] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  const userRole = useUserRole(user);
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

  useEffect(() => {
    if (!projectId) return;

    // Get project info
    const getProject = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", projectId));
        if (projectDoc.exists()) {
          setProject({
            id: projectDoc.id,
            ...projectDoc.data()
          } as ProjectData);
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
        console.log("Project ideas snapshot received:", snapshot.size);
        const ideasData: ProjectIdeaData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as ProjectIdeaData;
          console.log("Project idea data:", data);
          console.log("Staff comment for idea", doc.id, ":", data.staffComment);
          console.log("Translations for idea", doc.id, ":", data.translations);
          if (data.projectId === projectId) {
            ideasData.push({
              id: doc.id,
              ...data
            });
          }
        });
        setIdeas(ideasData);
        setLoading(false);
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

  // Safe automatic translation on page load and language change
  useEffect(() => {
    if (ideas.length > 0) {
      console.log(`🔄 IDEAS LOADED/LANGUAGE CHANGED - Starting safe auto-translation to ${translationLang}`);
      
      // Use the same direct translation approach that worked with the manual button
      const runSafeAutoTranslation = async () => {
        try {
          let translationCount = 0;
          
          for (const idea of ideas) {
            // Check if staff comment needs translation or retranslation
            const existingTranslation = idea.translations?.[translationLang]?.staffComment;
            let needsTranslation = false;
            
            if (idea.staffComment) {
              if (!existingTranslation) {
                // No translation exists
                needsTranslation = true;
                console.log(`❌ Missing translation for idea ${idea.id} staffComment: "${idea.staffComment}"`);
              } else {
                // Translation exists - check if it's in the wrong language
                const isEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(existingTranslation.trim());
                const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(existingTranslation.trim());
                
                if (translationLang === 'ja' && isEnglish && !isJapanese) {
                  needsTranslation = true;
                  console.log(`❌ Wrong language for idea ${idea.id}: expected Japanese but got "${existingTranslation}"`);
                } else if (translationLang === 'en' && isJapanese && !isEnglish) {
                  needsTranslation = true;
                  console.log(`❌ Wrong language for idea ${idea.id}: expected English but got "${existingTranslation}"`);
                }
              }
            }
            
            if (needsTranslation) {
              console.log(`🔄 Auto-translating staffComment for idea ${idea.id}`);
              
              try {
                // Direct translation without complex validation
                const { translateText } = await import('../translation');
                const translatedComment = await translateText(idea.staffComment, translationLang);
                
                console.log(`Translation result: "${idea.staffComment}" -> "${translatedComment}"`);
                
                if (translatedComment && translatedComment !== idea.staffComment) {
                  // Save directly to Firestore
                  await updateDoc(doc(db, "projectIdeas", idea.id), {
                    [`translations.${translationLang}.staffComment`]: translatedComment
                  });
                  
                  translationCount++;
                  console.log(`✅ Auto-translated staffComment for idea ${idea.id}: "${translatedComment}"`);
                  
                  // Small delay between translations to avoid overwhelming the API
                  if (translationCount < 5) { // Limit to 5 translations per load
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  } else {
                    console.log(`⏸️ Auto-translation limit reached (5), stopping`);
                    break;
                  }
                } else {
                  console.log(`⚠️ Translation returned same text for idea ${idea.id}, skipping`);
                }
              } catch (error) {
                console.error(`❌ Auto-translation failed for idea ${idea.id}:`, error);
              }
            }
          }
          
          if (translationCount > 0) {
            setRefreshCounter(prev => prev + 1);
            console.log(`🎉 Auto-translation completed: ${translationCount} staff comments translated`);
          } else {
            console.log(`✅ No auto-translation needed - all staff comments already translated`);
          }
        } catch (error) {
          console.error("💥 Auto-translation failed:", error);
        }
      };
      
      // Add a delay to prevent rapid re-execution and let Firestore data settle
      const timeoutId = setTimeout(() => {
        runSafeAutoTranslation();
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [ideas, translationLang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("HandleSubmit called with data:", formData);
    console.log("ProjectId:", projectId);
    console.log("User:", user.uid);
    
    if (!projectId || !formData.title.trim() || !formData.content.trim()) {
      console.log("Validation failed:", { projectId, title: formData.title, content: formData.content });
      return;
    }

    console.log("Starting project idea creation...");
    
    try {
      if (editingIdea) {
        console.log("Updating existing project idea:", editingIdea.id);
        await updateDoc(doc(db, "projectIdeas", editingIdea.id), {
          title: formData.title,
          content: formData.content,
          updatedAt: serverTimestamp()
        });
        console.log("Project idea updated successfully");
      } else {
        console.log("Creating new project idea...");
        
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
          docData.translations = { [lang]: { title: formData.title, content: formData.content } };
        }

        const docRef = await addDoc(collection(db, "projectIdeas"), docData);
        console.log("New project idea created with ID:", docRef.id);
      }

      setFormData({ title: "", content: "" });
      setShowForm(false);
      setEditingIdea(null);
      console.log("Form reset and closed");
    } catch (error) {
      console.error("Error saving project idea:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack
      });
      
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

  const handleDelete = async (ideaId: string) => {
    if (!confirm(t("deleteIdeaConfirm"))) return;

    try {
      await deleteDoc(doc(db, "projectIdeas", ideaId));
    } catch (error) {
      console.error("Error deleting project idea:", error);
    }
  };

  const handleStatusUpdate = async (ideaId: string, status: IdeaStatus, comment: string, period: string) => {
    try {
      console.log("=== handleStatusUpdate START ===");
      console.log("Parameters:", { ideaId, status, comment, period });
      console.log("User role:", userRole);
      console.log("User UID:", user.uid);
      console.log("User email:", user.email);
      
      // Always check user role directly from Firestore for debugging
      console.log("Fetching user role directly from Firestore...");
      
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        console.log("User document from Firestore:", userData);
        console.log("User exists in Firestore:", userDoc.exists());
        
        if (!userDoc.exists()) {
          alert("ユーザードキュメントがFirestoreに存在しません。管理者に連絡してください。");
          return;
        }
        
        if (!userData || (userData.role !== 'staff' && userData.role !== 'admin')) {
          alert(`権限エラー: 運営操作には'staff'または'admin'ロールが必要です。現在のロール: ${userData?.role || 'undefined'}`);
          return;
        }
        
        console.log("Permission check passed. User role:", userData.role);
        
      } catch (roleError) {
        console.error("Failed to fetch user role:", roleError);
        alert("ユーザーロールの確認に失敗しました: " + roleError.message);
        return;
      }
      
      // First try with minimal update data to test permissions
      const basicUpdateData = {
        status,
        staffComment: comment,
        developmentPeriod: period,
        updatedAt: serverTimestamp()
      };
      
      console.log("Basic update data:", basicUpdateData);
      
      try {
        await updateDoc(doc(db, "projectIdeas", ideaId), basicUpdateData);
        console.log("Basic update successful");
        
        // Update translations for current language immediately
        const idea = ideas.find(i => i.id === ideaId);
        if (idea?.translations && comment.trim()) {
          console.log("Updating translation for current language:", lang);
          const translationUpdateData = {
            [`translations.${lang}.staffComment`]: comment
          };
          
          await updateDoc(doc(db, "projectIdeas", ideaId), translationUpdateData);
          console.log("Translation update successful for language:", lang);
        }
        
        // Update all existing translation languages with the new comment
        if (idea?.translations && comment.trim()) {
          const existingLangs = Object.keys(idea.translations);
          console.log("Updating translations for all existing languages:", existingLangs);
          
          for (const existingLang of existingLangs) {
            if (existingLang !== lang) {
              // Don't overwrite, just ensure the original language has the new comment
              if (existingLang === idea.originalLang) {
                const originalLangUpdate = {
                  [`translations.${existingLang}.staffComment`]: comment
                };
                await updateDoc(doc(db, "projectIdeas", ideaId), originalLangUpdate);
                console.log("Updated original language translation:", existingLang);
              }
            }
          }
        }
        
        // Auto-translate the staff comment to ALL languages
        if (comment.trim()) {
          console.log("Auto-translating staff comment to all languages. Comment:", comment);
          
          // Clear translation cache first
          clearTranslationCache(ideaId);
          
          // Wait a bit for Firestore to reflect the staffComment update, then translate to all languages
          setTimeout(async () => {
            console.log("Starting multi-language translation for updated staffComment");
            
            // Create idea object with new staffComment for multi-language translation
            const ideaToUpdate = ideas.find(i => i.id === ideaId);
            const updatedIdea = {
              ...ideaToUpdate,
              staffComment: comment, // Use the comment parameter directly
              originalLang: ideaToUpdate?.originalLang || 'ja',
              translations: {} // Clear to force new translation
            };
            
            console.log("About to translate staff comment to all languages:", {
              ideaId,
              staffComment: updatedIdea.staffComment,
              originalLang: updatedIdea.originalLang
            });
            
            try {
              // Translate to all supported languages
              await translateStaffCommentToAllLanguages(updatedIdea as ProjectIdeaData);
              console.log("Multi-language translation completed, refreshing UI");
              setRefreshCounter(prev => prev + 1);
            } catch (error) {
              console.error("Multi-language translation failed:", error);
            }
          }, 2000); // Wait 2 seconds for Firestore to update
        }
        
      } catch (basicError) {
        console.error("Basic update failed:", basicError);
        throw basicError;
      }
      
      setStaffComment("");
      setDevelopmentPeriod("");
      console.log("=== handleStatusUpdate SUCCESS ===");
      
    } catch (error) {
      console.error("=== handleStatusUpdate ERROR ===");
      console.error("Error updating status:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      alert(`エラーが発生しました: ${error.message}`);
    }
  };

  const canEditIdea = (idea: ProjectIdeaData) => {
    return userRole === 'admin' || idea.createdBy === user.uid;
  };

  const canDeleteIdea = (idea: ProjectIdeaData) => {
    return userRole === 'admin' || idea.createdBy === user.uid;
  };

  const canManageStatus = () => {
    return userRole === 'admin' || userRole === 'staff';
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
        <Link to="/projects" style={{ textDecoration: 'none', color: '#007bff' }}>
          {t("backToProjects")}
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0' }}>
          <h1 style={{ margin: 0 }}>
            {project?.name || t("project")} - {t("ideaMgmt")}
          </h1>
          <select 
            value={translationLang} 
            onChange={(e) => {
              const newLang = e.target.value;
              console.log(`🔄 MANUAL LANGUAGE CHANGE: ${translationLang} -> ${newLang}`);
              setTranslationLang(newLang);
              
              // The useEffect will handle the translation check automatically
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
        {project?.description && (
          <p style={{ color: '#666', margin: '0.5rem 0 1rem 0' }}>
            {project.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
          
          {/* Debug buttons - only show in development */}
          {import.meta.env.DEV && (
            <>
              <button
                onClick={() => {
                  console.log("🔧 MANUAL TRANSLATION TRIGGER");
                  if (ideas.length > 0) {
                    ensureTranslationsExist(ideas).then(() => {
                      setRefreshCounter(prev => prev + 1);
                    }).catch(console.error);
                  }
                }}
                style={{
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                🔄 翻訳チェック
              </button>
              <button
                onClick={async () => {
                  console.log("🧪 TESTING TRANSLATION API");
                  const { translateText } = await import('../translation');
                  
                  try {
                    console.log("Testing basic translation...");
                    const testResult1 = await translateText("Hello, this is a test", "ja");
                    console.log("✅ Basic test result:", testResult1);
                    
                    console.log("Testing problematic text...");
                    const testResult2 = await translateText("The coin is best", "ja");
                    console.log("✅ Problematic text result:", testResult2);
                    
                    alert(`基本テスト: "${testResult1}"\n問題のテキスト: "${testResult2}"`);
                  } catch (error) {
                    console.error("❌ Translation API test failed:", error);
                    alert(`翻訳API テスト失敗: ${error.message}`);
                  }
                }}
                style={{
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                🧪 API テスト
              </button>
              <button
                onClick={async () => {
                  console.log("🔧 DIRECT STAFF COMMENT TEST");
                  const { translateText } = await import('../translation');
                  
                  const testTexts = [
                    "The coin is best",
                    "i fly", 
                    "good idea",
                    "これは良いアイデアです"
                  ];
                  
                  for (const text of testTexts) {
                    try {
                      const result = await translateText(text, "ja");
                      console.log(`"${text}" -> "${result}"`);
                    } catch (error) {
                      console.error(`Failed to translate "${text}":`, error);
                    }
                  }
                  
                  alert("翻訳テスト完了 - コンソールを確認してください");
                }}
                style={{
                  backgroundColor: '#e83e8c',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                🔧 運営コメントテスト
              </button>
            </>
          )}
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
                <h3 style={{ margin: 0, color: '#333' }}>{translatedContent.title}</h3>
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
                      onClick={() => handleDelete(idea.id)}
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
                  {/* Debug translation button - only show in development */}
                  {import.meta.env.DEV && !isTranslating(idea.id) && (
                    <button
                      onClick={() => {
                        console.log(`🔧 Manual force translate for idea ${idea.id}`);
                        forceTranslateIdea(idea).then(() => {
                          setRefreshCounter(prev => prev + 1);
                        }).catch(console.error);
                      }}
                      style={{
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      🔄 強制翻訳
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong>{t("postedAt")}</strong> {idea.createdAt?.toDate ? idea.createdAt.toDate().toLocaleDateString() : t("unknown")}
              </div>
              
              <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                <strong>{t("content")}:</strong><br />
                {translatedContent.content}
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong>{t("adminJudgment")}</strong>{' '}
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
                      <strong>{t("adminComment")}</strong><br />
                      {translatedContent.staffComment}
                    </div>
                  </div>
                </div>
              )}
              
              {idea.developmentPeriod && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>{t("developmentPeriod")}</strong> {idea.developmentPeriod}
                </div>
              )}
              
{canManageStatus() && (
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>{t("adminOperations")}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as IdeaStatus)}
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
                    <input
                      type="text"
                      value={staffComment}
                      onChange={(e) => setStaffComment(e.target.value)}
                      placeholder={t("adminCommentPlaceholder")}
                      style={{
                        flex: 1,
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                      key={`${idea.id}-comment`}
                    />
                    <input
                      type="text"
                      value={developmentPeriod}
                      onChange={(e) => setDevelopmentPeriod(e.target.value)}
                      placeholder={t("developmentPeriodPlaceholder")}
                      style={{
                        width: '100px',
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    />
                    <button
                      onClick={() => handleStatusUpdate(idea.id, selectedStatus, staffComment, developmentPeriod)}
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
    </div>
  );
};

export default ProjectIdeas;