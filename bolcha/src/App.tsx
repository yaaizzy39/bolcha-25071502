import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import ChatRoom from "./pages/ChatRoom";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Profile from "./pages/Profile";

function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  if (!user) {
    return <Login />;
  }

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", padding: "1rem" }}>
        <h2>Bolcha</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to="/profile">Settings</Link>
          <button onClick={() => signOut(auth)}>Logout</button>
        </div>
      </header>
      <main style={{ padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<Rooms user={user} />} />
          <Route path="/rooms/:roomId" element={<ChatRoom user={user} />} />
          <Route path="/profile" element={<Profile user={user} />} />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
