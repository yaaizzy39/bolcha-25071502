import { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import ChatRoom from "./pages/ChatRoom";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useUserPrefs } from "./hooks/useUserPrefs";
import "./utils/migrateUserData"; // マイグレーション関数をグローバルに公開

// Minimal abstract icons
const IconGrid = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
  </svg>
);
const IconSliders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);
const IconCog = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconLogOut = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

import useIsAdmin from "./hooks/useIsAdmin";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const isAdmin = useIsAdmin(user);
  const { prefs: userPrefs, setPrefs: setUserPrefs } = useUserPrefs(user?.uid || "");

  const location = useLocation();
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      
      if (u) {
        // Check if user is in the deleted/blocked list
        try {
          const deletedUsersRef = doc(db, "admin", "deletedUsers");
          const deletedUsersDoc = await getDoc(deletedUsersRef);
          
          if (deletedUsersDoc.exists() && deletedUsersDoc.data()[u.uid]) {
            // User account disabled - removing sensitive logging
            alert("Your account has been disabled by an administrator. Please contact support if you believe this is an error.");
            await signOut(auth);
            return;
          }
        } catch (error) {
        }
        
        // 新規ユーザーのニックネーム設定チェック（userProfilesコレクションから）
        try {
          const userProfileDoc = await getDoc(doc(db, "userProfiles", u.uid));
          if (userProfileDoc.exists()) {
            const userData = userProfileDoc.data();
            // ニックネームが設定されていない場合
            if (!userData.nickname?.trim()) {
              setNeedsNickname(true);
            } else {
              setNeedsNickname(false);
            }
          } else {
            // 新規ユーザー（ドキュメントが存在しない）
            setNeedsNickname(true);
          }
        } catch (error) {
          setNeedsNickname(false);
        }
      } else {
        setNeedsNickname(false);
      }
      
      setUser(u);
    });
    return unsub;
  }, []);

  // Listen for userPrefsUpdated event from Profile page
  useEffect(() => {
    const handleUserPrefsUpdate = (event: CustomEvent) => {
      const { uid, prefs } = event.detail;
      if (uid === user?.uid) {
        setUserPrefs(prefs);
        // ニックネームが設定されたかチェック
        if (prefs.nickname?.trim()) {
          setNeedsNickname(false);
        }
      }
    };

    window.addEventListener('userPrefsUpdated', handleUserPrefsUpdate as EventListener);
    
    return () => {
      window.removeEventListener('userPrefsUpdated', handleUserPrefsUpdate as EventListener);
    };
  }, [user?.uid, setUserPrefs]);

  // Monitor deleted users list - auto logout if user is deleted by admin
  useEffect(() => {
    if (!user?.uid) return;

    const deletedUsersRef = doc(db, "admin", "deletedUsers");
    const unsubscribe = onSnapshot(deletedUsersRef, (doc) => {
      if (doc.exists()) {
        const deletedUsers = doc.data();
        // If current user is in the deleted users list, force logout
        if (deletedUsers && deletedUsers[user.uid]) {
          alert("Your account has been deleted by an administrator. You will be logged out.");
          signOut(auth).catch(console.error);
        }
      }
    }, (error) => {
      // Handle potential permission errors gracefully
    });

    return unsubscribe;
  }, [user?.uid]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowLogoutConfirm(false);
    } catch (error) {
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  if (!user) {
    return <Login />;
  }
  const hideNav = location.pathname.startsWith("/profile");

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      minHeight: "100vh",
      backgroundColor: userPrefs.backgroundColor || "#f5f5f5"
    }}>
      <header style={{
                        display: "flex",
        justifyContent: "space-between",
        
        position: "fixed",
        width: "100%",
        left: 0,
        right: 0,
        top: 0,
        background: "#fff",
        zIndex: 100,
        boxShadow: "0 1px 4px rgba(0,0,0,0.0)"
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0.5rem 1rem 1rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: '45px' }}>
        <h2 style={{ margin: 0, lineHeight: 1.4, display: 'flex', alignItems: 'center' }}>
  <img    
    src="/Bolcha-icon-250614-01.svg"
    alt="Bolcha icon"
    
    height={28}
    style={{ marginRight: 8, verticalAlign: 'middle', display: 'inline-block' }}
  />
  <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>Bolcha</Link>
</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!hideNav && (
            <>
              <Link to="/" title="Rooms"><IconGrid /></Link>
              {isAdmin && <Link to="/admin" title="Admin"><IconSliders /></Link>}
              <Link to="/profile" title="Settings"><IconCog /></Link>
            </>
          )}
          {user && (
            <>
              <Link to="/profile" title="Profile Settings">
                <img
                  src={user.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23ddd'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%23bbb'/%3E%3Cellipse cx='16' cy='24' rx='9' ry='6' fill='%23bbb'/%3E%3C/svg%3E"}
                  alt="my avatar"
                  height={28}
                  style={{ borderRadius: '50%', background: '#eee', marginLeft: 4, marginRight: 4, cursor: 'pointer' }}
                />
              </Link>
              {!hideNav && (
                <button 
                  onClick={handleLogoutClick}
                  title="Logout"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'inherit'
                  }}
                >
                  <IconLogOut />
                </button>
              )}
            </>
          )}

        </div>
              </div>
      </header>
      <main style={{ padding: "60px 1rem 1rem 1rem", flex: 1, display: "flex", flexDirection: "column" }}>
        <Routes>
          <Route path="/" element={
            needsNickname && location.pathname !== '/profile' ? 
            <Navigate to="/profile" replace /> : 
            <Rooms user={user!} />
          } />
          <Route path="/rooms/:roomId" element={
            needsNickname ? 
            <Navigate to="/profile" replace /> : 
            <ChatRoom user={user!} />
          } />
          <Route path="/profile" element={<Profile user={user!} />} />
          {isAdmin && <Route path="/admin" element={
            needsNickname ? 
            <Navigate to="/profile" replace /> : 
            <Admin user={user!} />
          } />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      
      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div style={{ 
          position: "fixed", 
          top: 0, 
          left: 0, 
          width: "100%", 
          height: "100%", 
          background: "rgba(0,0,0,0.5)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          zIndex: 1000 
        }}>
          <div style={{ 
            background: "#fff", 
            padding: "1.5rem 2rem", 
            borderRadius: 8, 
            maxWidth: 320, 
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
          }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>ログアウトしますか？</h3>
            <p style={{ margin: "0 0 1.5rem 0", color: "#666", fontSize: "0.9rem" }}>
              現在のセッションを終了してログイン画面に戻ります。
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
              <button 
                onClick={handleLogout}
                style={{
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
              >
                ログアウト
              </button>
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
