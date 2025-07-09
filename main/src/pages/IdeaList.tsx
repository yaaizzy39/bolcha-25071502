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
}

const IdeaList = ({ user }: IdeaListProps) => {
  const [ideas, setIdeas] = useState<GlobalIdeaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<GlobalIdeaData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: ""
  });
  const [staffComment, setStaffComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<IdeaStatus>('pending');
  const [developmentPeriod, setDevelopmentPeriod] = useState("");
  
  const userRole = useUserRole(user);

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
          ideasData.push({
            id: doc.id,
            ...data
          });
        });
        setIdeas(ideasData);
        setLoading(false);
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
        const docRef = await addDoc(collection(db, "globalIdeas"), {
          title: formData.title,
          content: formData.content,
          status: 'pending',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
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
      
      let errorMessage = "アイデアの保存中にエラーが発生しました";
      if (error.code === 'permission-denied') {
        errorMessage = "権限エラー: アイデアの作成権限がありません。管理者に連絡してください。";
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
    if (!confirm("このアイデアを削除しますか？")) return;

    try {
      await deleteDoc(doc(db, "globalIdeas", ideaId));
    } catch (error) {
      console.error("Error deleting global idea:", error);
    }
  };

  const handleStatusUpdate = async (ideaId: string, status: IdeaStatus, comment: string, period: string) => {
    try {
      await updateDoc(doc(db, "globalIdeas", ideaId), {
        status,
        staffComment: comment,
        developmentPeriod: period,
        updatedAt: serverTimestamp()
      });
      setStaffComment("");
      setDevelopmentPeriod("");
    } catch (error) {
      console.error("Error updating status:", error);
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
      case 'pending': return '検討中';
      case 'approved': return '採用';
      case 'rejected': return '却下';
      default: return status;
    }
  };

  const getStatusColor = (status: IdeaStatus) => {
    switch (status) {
      case 'pending': return '#ffc107';
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div>読み込み中...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#007bff' }}>
          ← ホームに戻る
        </Link>
        <h1 style={{ margin: '0.5rem 0' }}>
          アイデア管理
        </h1>
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
          新しいアイデアを投稿
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
            <h2>{editingIdea ? 'アイデアを編集' : '新しいアイデアを投稿'}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  タイトル *
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
                  アイデアの内容 *
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
                  {editingIdea ? '更新' : '投稿'}
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
                  キャンセル
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
            まだアイデアがありません
          </div>
        ) : (
          ideas.map((idea) => (
            <div
              key={idea.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#f9f9f9'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#333' }}>{idea.title}</h3>
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
                      編集
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
                      削除
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong>投稿日:</strong> {idea.createdAt?.toDate ? idea.createdAt.toDate().toLocaleDateString() : '不明'}
              </div>
              
              <div style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
                <strong>内容:</strong><br />
                {idea.content}
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <strong>運営の判断:</strong>{' '}
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
              
              {idea.staffComment && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>運営コメント:</strong><br />
                  {idea.staffComment}
                </div>
              )}
              
              {idea.developmentPeriod && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>開発期間:</strong> {idea.developmentPeriod}
                </div>
              )}
              
              {canManageStatus() && (
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>運営操作:</strong>
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
                      <option value="pending">検討中</option>
                      <option value="approved">採用</option>
                      <option value="rejected">却下</option>
                    </select>
                    <input
                      type="text"
                      value={staffComment}
                      onChange={(e) => setStaffComment(e.target.value)}
                      placeholder="運営コメント"
                      style={{
                        flex: 1,
                        padding: '0.25rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    />
                    <input
                      type="text"
                      value={developmentPeriod}
                      onChange={(e) => setDevelopmentPeriod(e.target.value)}
                      placeholder="開発期間"
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
                      更新
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IdeaList;