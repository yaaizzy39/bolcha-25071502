import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "firebase/auth";
import type { IdeaStatus, UserRole } from "../types";
import useUserRole from "../hooks/useUserRole";
import { useI18n } from "../i18n";
import { useIdeaTranslation } from "../hooks/useIdeaTranslation";
import { detectLanguage } from "../langDetect";

interface IdeaListProps {
  user: User;
}

interface GlobalIdeaData {
  id: string;
  title: string;
  content: string;
  status: IdeaStatus;
  staffComment?: string;
  developmentPeriod?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  originalLang?: string;
  translations?: Record<string, { title: string; content: string; staffComment?: string; }>;
}

const IdeaList = ({ user }: IdeaListProps) => {
  const { t, lang } = useI18n();
  const [ideas, setIdeas] = useState<GlobalIdeaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfiles, setUserProfiles] = useState<Record<string, { nickname: string; avatar: string }>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<GlobalIdeaData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: ""
  });
  const [staffComment, setStaffComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<IdeaStatus>('unconfirmed');
  const [developmentPeriod, setDevelopmentPeriod] = useState("");
  
  const userRole = useUserRole(user);
  const { 
    getTranslatedContent, 
    translateIdea, 
    autoTranslateIdeas, 
    isTranslating,
    translationLang,
    setTranslationLang
  } = useIdeaTranslation<GlobalIdeaData>('globalIdeas');

  useEffect(() => {
    // Listen to global ideas
    try {
      const q = query(
        collection(db, "globalIdeas"),
        orderBy("createdAt", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Global ideas snapshot received:", snapshot.size);
        const ideasData: GlobalIdeaData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as GlobalIdeaData;
          console.log("Global idea data:", data);
          console.log("Staff comment for idea", doc.id, ":", data.staffComment);
          console.log("Translations for idea", doc.id, ":", data.translations);
          ideasData.push({
            id: doc.id,
            ...data
          });
        });
        setIdeas(ideasData);
        setLoading(false);
        
        // Fetch user profiles for idea creators
        const uniqueUserIds = [...new Set(ideasData.map(idea => idea.createdBy).filter(Boolean))];
        fetchUserProfiles(uniqueUserIds);
      }, (error) => {
        console.error("Error listening to global ideas:", error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up global ideas listener:", error);
      setLoading(false);
      return () => {};
    }
  }, []);

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

  // Auto-translate ideas when translation language changes or new ideas are loaded
  useEffect(() => {
    if (ideas.length > 0) {
      autoTranslateIdeas(ideas);
    }
  }, [ideas, translationLang, autoTranslateIdeas]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("HandleSubmit called with data:", formData);
    console.log("User:", user.uid);
    
    if (!formData.title.trim() || !formData.content.trim()) {
      console.log("Validation failed:", { title: formData.title, content: formData.content });
      return;
    }

    console.log("Starting global idea creation...");
    
    try {
      if (editingIdea) {
        console.log("Updating existing global idea:", editingIdea.id);
        await updateDoc(doc(db, "globalIdeas", editingIdea.id), {
          title: formData.title,
          content: formData.content,
          updatedAt: serverTimestamp()
        });
        console.log("Global idea updated successfully");
      } else {
        console.log("Creating new global idea...");
        
        // Detect language of the content
        const detectedLang = await detectLanguage(formData.content);
        
        const docRef = await addDoc(collection(db, "globalIdeas"), {
          title: formData.title,
          content: formData.content,
          status: 'unconfirmed',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          originalLang: detectedLang || lang,
          translations: detectedLang === lang ? { [lang]: { title: formData.title, content: formData.content } } : undefined
        });
        console.log("New global idea created with ID:", docRef.id);
      }

      setFormData({ title: "", content: "" });
      setShowForm(false);
      setEditingIdea(null);
      console.log("Form reset and closed");
    } catch (error) {
      console.error("Error saving global idea:", error);
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

  const handleEdit = (idea: GlobalIdeaData) => {
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
      await deleteDoc(doc(db, "globalIdeas", ideaId));
    } catch (error) {
      console.error("Error deleting global idea:", error);
    }
  };

  const handleStatusUpdate = async (ideaId: string, status: IdeaStatus, comment: string, period: string) => {
    try {
      console.log("handleStatusUpdate called:", { ideaId, status, comment, period, userRole });
      
      const updateData = {
        status,
        staffComment: comment,
        developmentPeriod: period,
        updatedAt: serverTimestamp()
      };
      
      // Update translations for current language and ensure consistency
      const idea = ideas.find(i => i.id === ideaId);
      console.log("Found idea:", idea);
      console.log("Current language:", lang);
      console.log("Idea translations:", idea?.translations);
      
      if (idea?.translations && comment.trim()) {
        console.log("Adding translation update for staffComment");
        // Always update the translation for the current UI language
        updateData[`translations.${lang}.staffComment`] = comment;
        
        // If current language is the original language, ensure consistency
        if (lang === idea.originalLang) {
          console.log("Updating original language translation consistency");
          // Update all existing translation languages to maintain consistency
          const existingLangs = Object.keys(idea.translations);
          for (const existingLang of existingLangs) {
            if (existingLang !== lang) {
              updateData[`translations.${existingLang}.staffComment`] = comment;
            }
          }
        }
      }
      
      console.log("Update data:", updateData);
      
      await updateDoc(doc(db, "globalIdeas", ideaId), updateData);
      console.log("Update successful");
      
      // Auto-translate the staff comment to other languages
      if (comment.trim()) {
        console.log("Auto-translating staff comment...");
        // Create a temporary idea object with the new comment for translation
        const updatedIdea = {
          ...idea,
          staffComment: comment,
          translations: idea?.translations || {}
        };
        
        // Trigger translation for the updated idea
        setTimeout(() => {
          translateIdea(updatedIdea as GlobalIdeaData);
        }, 1000); // Small delay to ensure Firestore update is complete
      }
      
      setStaffComment("");
      setDevelopmentPeriod("");
    } catch (error) {
      console.error("Error updating status:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      alert(`エラーが発生しました: ${error.message}`);
    }
  };

  const canEditIdea = (idea: GlobalIdeaData) => {
    return userRole === 'admin' || idea.createdBy === user.uid;
  };

  const canDeleteIdea = (idea: GlobalIdeaData) => {
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

  // CSV download function
  const downloadCSV = () => {
    if (ideas.length === 0) {
      alert(t('noDataToExport') || 'No data to export');
      return;
    }

    // CSV headers
    const headers = [
      'ID',
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
        `"${(translatedContent.title || '').replace(/"/g, '""')}"`,
        `"${(translatedContent.content || '').replace(/"/g, '""')}"`,
        getStatusText(idea.status),
        idea.createdBy || '',
        `"${idea.createdAt?.toDate ? idea.createdAt.toDate().toLocaleDateString() : ''}"`,
        `"${idea.updatedAt?.toDate ? idea.updatedAt.toDate().toLocaleDateString() : ''}"`,
        `"${(translatedContent.staffComment || '').replace(/"/g, '""')}"`,
        `"${(idea.developmentPeriod || '').replace(/"/g, '""')}"`,
        idea.originalLang || ''
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const timestamp = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `global_ideas_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (loading) {
    return <div>{t("loading")}</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#6e283c' }}>
          {t("backToHome")}
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0' }}>
          <h1 style={{ margin: 0 }}>
            {t("ideaMgmt")}
          </h1>
          <select 
            value={translationLang} 
            onChange={(e) => setTranslationLang(e.target.value)} 
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
        <button
          onClick={downloadCSV}
          style={{
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {lang === 'en' ? 'Download CSV' : 'CSV ダウンロード'}
        </button>
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
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            {t("noIdeas")}
          </div>
        ) : (
          ideas.map((idea) => {
            const translatedContent = getTranslatedContent(idea);
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
                  {!isTranslating(idea.id) && idea.originalLang !== translationLang && (
                    <button
                      onClick={() => translateIdea(idea)}
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
                      翻訳
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ color: '#6e283c' }}>{t("postedAt")}</strong> <span style={{ color: '#666' }}>{idea.createdAt?.toDate ? idea.createdAt.toDate().toLocaleDateString() : t("unknown")}</span>
              </div>
              
              <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: '#6e283c' }}>{t("content")}:</strong><br />
                <span style={{ color: '#333' }}>{translatedContent.content}</span>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ color: '#6e283c' }}>{t("adminJudgment")}</strong>{' '}
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
                      <strong style={{ color: '#6e283c' }}>{t("adminComment")}</strong><br />
                      <span style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{translatedContent.staffComment}</span>
                    </div>
                    {!isTranslating(idea.id) && idea.originalLang !== translationLang && idea.staffComment && (
                      <button
                        onClick={() => translateIdea(idea)}
                        style={{
                          backgroundColor: '#17a2b8',
                          color: 'white',
                          border: 'none',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          marginLeft: '0.5rem'
                        }}
                        title="運営コメントを翻訳"
                      >
                        翻訳
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {idea.developmentPeriod && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong style={{ color: '#6e283c' }}>{t("developmentPeriod")}</strong> <span style={{ color: '#333' }}>{idea.developmentPeriod}</span>
                </div>
              )}
              
{canManageStatus() && (
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#6e283c' }}>{t("adminOperations")}</strong>
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

export default IdeaList;