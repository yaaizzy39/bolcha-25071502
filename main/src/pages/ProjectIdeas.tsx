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

interface ProjectIdeasProps {
  user: User;
}

const ProjectIdeas = ({ user }: ProjectIdeasProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [ideas, setIdeas] = useState<ProjectIdeaData[]>([]);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ProjectIdeaData | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    developmentPeriod: ""
  });
  const [staffComment, setStaffComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<IdeaStatus>('pending');
  
  const userRole = useUserRole(user);

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
          developmentPeriod: formData.developmentPeriod,
          updatedAt: serverTimestamp()
        });
        console.log("Project idea updated successfully");
      } else {
        console.log("Creating new project idea...");
        const docRef = await addDoc(collection(db, "projectIdeas"), {
          title: formData.title,
          content: formData.content,
          developmentPeriod: formData.developmentPeriod,
          status: 'pending',
          createdBy: user.uid,
          projectId: projectId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log("New project idea created with ID:", docRef.id);
      }

      setFormData({ title: "", content: "", developmentPeriod: "" });
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
      
      let errorMessage = "アイデアの保存中にエラーが発生しました";
      if (error.code === 'permission-denied') {
        errorMessage = "権限エラー: アイデアの作成権限がありません。管理者に連絡してください。";
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
      content: idea.content,
      developmentPeriod: idea.developmentPeriod || ""
    });
    setShowForm(true);
  };

  const handleDelete = async (ideaId: string) => {
    if (!confirm("このアイデアを削除しますか？")) return;

    try {
      await deleteDoc(doc(db, "projectIdeas", ideaId));
    } catch (error) {
      console.error("Error deleting project idea:", error);
    }
  };

  const handleStatusUpdate = async (ideaId: string, status: IdeaStatus, comment: string) => {
    try {
      await updateDoc(doc(db, "projectIdeas", ideaId), {
        status,
        staffComment: comment,
        updatedAt: serverTimestamp()
      });
      setStaffComment("");
    } catch (error) {
      console.error("Error updating status:", error);
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
        <Link to="/projects" style={{ textDecoration: 'none', color: '#007bff' }}>
          ← プロジェクト一覧に戻る
        </Link>
        <h1 style={{ margin: '0.5rem 0' }}>
          {project?.name || 'プロジェクト'} - アイデア管理
        </h1>
        {project?.description && (
          <p style={{ color: '#666', margin: '0.5rem 0 1rem 0' }}>
            {project.description}
          </p>
        )}
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
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  開発期間
                </label>
                <input
                  type="text"
                  value={formData.developmentPeriod}
                  onChange={(e) => setFormData({ ...formData, developmentPeriod: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
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
                    setFormData({ title: "", content: "", developmentPeriod: "" });
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
          <div style={{ textAlign: 'center', padding: '3rem', color: '#666', border: '2px dashed #ddd', borderRadius: '8px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
            <h3>まだアイデアがありません</h3>
            <p>最初のアイデアを投稿しましょう</p>
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
                    <button
                      onClick={() => handleStatusUpdate(idea.id, selectedStatus, staffComment)}
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

export default ProjectIdeas;