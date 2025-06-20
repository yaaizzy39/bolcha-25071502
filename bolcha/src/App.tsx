import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import ChatRoom from "./pages/ChatRoom";
import { Routes, Route, Navigate } from "react-router-dom";

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
        <button onClick={() => signOut(auth)}>Logout</button>
      </header>
      <main style={{ padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<Rooms user={user} />} />
          <Route path="/rooms/:roomId" element={<ChatRoom user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
