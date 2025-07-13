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
              } else {
                // Translation exists - check if it's in the wrong language
                const isEnglish = /^[a-zA-Z\s\.,!?'"0-9-]+$/.test(existingTranslation.trim());
                const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(existingTranslation.trim());
                
                if (translationLang === 'ja' && isEnglish && !isJapanese) {
                  needsTranslation = true;
                } else if (translationLang === 'en' && isJapanese && !isEnglish) {
                  needsTranslation = true;
                }
              }
            }
            
            if (needsTranslation) {
              try {
                // Direct translation without complex validation
                const { translateText } = await import('../translation');
                const translatedComment = await translateText(idea.staffComment, translationLang);
                
                if (translatedComment && translatedComment !== idea.staffComment) {
                  // Save directly to Firestore
                  await updateDoc(doc(db, "projectIdeas", idea.id), {
                    [`translations.${translationLang}.staffComment`]: translatedComment
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectId || !formData.title.trim() || !formData.content.trim()) {
      return;
    }
    
    try {
      if (editingIdea) {
        await updateDoc(doc(db, "projectIdeas", editingIdea.id), {
          title: formData.title,
          content: formData.content,
          updatedAt: serverTimestamp()
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
          docData.translations = { [lang]: { title: formData.title, content: formData.content } };
        }

        const docRef = await addDoc(collection(db, "projectIdeas"), docData);
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
        
        // Auto-translate the staff comment to ALL languages
        if (comment.trim()) {
          clearTranslationCache(ideaId);
          
          setTimeout(async () => {
            const ideaToUpdate = ideas.find(i => i.id === ideaId);
            const updatedIdea = {
              ...ideaToUpdate,
              staffComment: comment,
              originalLang: ideaToUpdate?.originalLang || 'ja',
              translations: {}
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
      
      setStaffComment("");
      setDevelopmentPeriod("");
      
    } catch (error) {
      console.error("Error updating status:", error);
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