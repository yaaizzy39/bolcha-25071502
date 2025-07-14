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
import type { ProjectData, UserRole } from "../types";
import useUserRole from "../hooks/useUserRole";
import { useI18n } from "../i18n";

interface ProjectListProps {
  user: User;
}

const ProjectList = ({ user }: ProjectListProps) => {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: ""
  });
  
  const userRole = useUserRole(user);

  useEffect(() => {
    try {
      const q = query(
        collection(db, "projects"),
        orderBy("updatedAt", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Projects snapshot received:", snapshot.size);
        const projectsData: ProjectData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as ProjectData;
          console.log("Project data:", data);
          projectsData.push({
            id: doc.id,
            ...data
          });
        });
        setProjects(projectsData);
        setLoading(false);
      }, (error) => {
        console.error("Error listening to projects:", error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up projects listener:", error);
      setLoading(false);
      return () => {};
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("HandleSubmit called with data:", formData);
    console.log("User:", user.uid);
    
    if (!formData.name.trim()) {
      console.log("Validation failed:", { name: formData.name });
      return;
    }

    // Check if user is admin for new project creation
    if (!editingProject && userRole !== 'admin') {
      alert(t("onlyAdminCanCreateProject") || "Only administrators can create new projects");
      return;
    }

    console.log("Starting project creation...");
    
    try {
      if (editingProject) {
        console.log("Updating existing project:", editingProject.id);
        await updateDoc(doc(db, "projects", editingProject.id), {
          name: formData.name,
          description: formData.description,
          updatedAt: serverTimestamp()
        });
        console.log("Project updated successfully");
      } else {
        console.log("Creating new project...");
        const docRef = await addDoc(collection(db, "projects"), {
          name: formData.name,
          description: formData.description,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log("New project created with ID:", docRef.id);
      }

      setFormData({ name: "", description: "" });
      setShowForm(false);
      setEditingProject(null);
      console.log("Form reset and closed");
    } catch (error) {
      console.error("Error saving project:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack
      });
      
      let errorMessage = t("saveProjectError");
      if (error.code === 'permission-denied') {
        errorMessage = t("permissionDeniedProject");
      } else if (error.message) {
        errorMessage += ": " + error.message;
      }
      
      alert(errorMessage);
    }
  };

  const handleEdit = (project: ProjectData) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || ""
    });
    setShowForm(true);
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm(t("deleteProjectConfirm"))) return;

    try {
      await deleteDoc(doc(db, "projects", projectId));
      // Note: プロジェクト削除時にアイデアも削除するロジックは後で実装
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  const canEditProject = (project: ProjectData) => {
    return userRole === 'admin' || project.createdBy === user.uid;
  };

  const canDeleteProject = (project: ProjectData) => {
    return userRole === 'admin' || project.createdBy === user.uid;
  };

  if (loading) {
    return <div>{t("loading")}</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#007bff' }}>
          {t("backToHome")}
        </Link>
        <h1 style={{ margin: '0.5rem 0' }}>
          {t("projectManagement")}
        </h1>
        {userRole === 'admin' && (
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
            {t("newProject")}
          </button>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div 
          style={{
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
          }}
          onClick={() => {
            setShowForm(false);
            setEditingProject(null);
            setFormData({ name: "", description: "" });
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '600px',
              position: 'relative',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingProject ? t("editProject") : t("newProject")}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {t("projectName")} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    pointerEvents: 'auto',
                    userSelect: 'text'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {t("description")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical',
                    pointerEvents: 'auto',
                    userSelect: 'text'
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
                  {editingProject ? t("update") : t("create")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingProject(null);
                    setFormData({ name: "", description: "" });
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

      {/* Projects List */}
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {projects.length === 0 ? (
          <div style={{ 
            gridColumn: '1 / -1',
            textAlign: 'center', 
            padding: '3rem', 
            color: '#666',
            border: '2px dashed #ddd',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
            <h3>{t("noProjects")}</h3>
            <p>{t("createFirstProject")}</p>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#333', fontSize: '1.2rem' }}>{project.name}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {canEditProject(project) && (
                    <button
                      onClick={() => handleEdit(project)}
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
                  {canDeleteProject(project) && (
                    <button
                      onClick={() => handleDelete(project.id)}
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
              
              {project.description && (
                <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
                  {project.description}
                </div>
              )}
              
              <div style={{ marginBottom: '1.5rem', color: '#999', fontSize: '0.8rem' }}>
                {t("createdAt")} {project.createdAt?.toDate ? project.createdAt.toDate().toLocaleDateString() : t("unknown")}
              </div>
              
              <Link
                to={`/projects/${project.id}/ideas`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#28a745',
                  color: 'white',
                  textDecoration: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  transition: 'backgroundColor 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e7e34';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }}
              >
                {t("manageIdeas")}
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectList;