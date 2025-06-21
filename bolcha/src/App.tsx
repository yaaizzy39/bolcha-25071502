import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import ChatRoom from "./pages/ChatRoom";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import useIsAdmin from "./hooks/useIsAdmin";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const isAdmin = useIsAdmin(user);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  if (!user) {
    return <Login />;
  }

  const location = useLocation();
  const hideNav = location.pathname.startsWith("/profile");

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", padding: "1rem" }}>
        <h2 style={{ margin: 0 }}><Link to="/" style={{ textDecoration: "none", color: "inherit" }}>Bolcha</Link></h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!hideNav && (
            <>
              <Link to="/">Rooms</Link>
              {isAdmin && <Link to="/admin">Admin Settings</Link>}
              <Link to="/profile">Settings</Link>
            </>
          )}
          <button onClick={() => signOut(auth)}>Logout</button>
        </div>
      </header>
      <main style={{ padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<Rooms user={user!} />} />
          <Route path="/rooms/:roomId" element={<ChatRoom user={user!} />} />
          <Route path="/profile" element={<Profile user={user!} />} />
          {isAdmin && <Route path="/admin" element={<Admin user={user!} />} />}
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
