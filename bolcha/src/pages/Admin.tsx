import { useEffect, useState } from "react";
import { collection, getDocs, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import useIsAdmin from "../hooks/useIsAdmin";

export default function Admin({ user }: { user: User }) {
  const isAdmin = useIsAdmin(user);
  const [gasList, setGasList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [rooms, setRooms] = useState<any[]>([]);

  useEffect(() => {
    const cfgRef = doc(db, "admin", "config");
    const unsub = onSnapshot(cfgRef, (snap) => {
      const data = snap.data();
      setGasList(data?.gasEndpoints ?? []);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchRooms = async () => {
      const snap = await getDocs(collection(db, "rooms"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRooms(list);
    };
    fetchRooms();
  }, [isAdmin]);

  const saveGasList = async (list: string[]) => {
    const cfgRef = doc(db, "admin", "config");
    await setDoc(cfgRef, { gasEndpoints: list }, { merge: true });
  };

  const addEndpoint = async () => {
    if (!newUrl.trim()) return;
    const list = [...gasList, newUrl.trim()];
    await saveGasList(list);
    setNewUrl("");
  };

  const removeEndpoint = async (idx: number) => {
    const list = gasList.filter((_, i) => i !== idx);
    await saveGasList(list);
  };

  const deleteRoom = async (roomId: string) => {
    if (!window.confirm("Delete room " + roomId + " ?")) return;
    try {
      const callable = httpsCallable(functions, "adminDeleteRoom");
      await callable({ roomId });
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      alert("Failed: " + (err as any).message);
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <div style={{ marginBottom: "1rem" }}>
          <Link to="/">← Rooms</Link> &nbsp; | &nbsp; <Link to="/profile">Settings</Link>
        </div>
        <p>Access denied.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/">← Rooms</Link> &nbsp; | &nbsp; <Link to="/profile">Settings</Link>
      </div>
      <h2>Admin Settings</h2>
      <section>
        <h3>GAS Endpoints</h3>
        <ul>
          {gasList.map((url, idx) => (
            <li key={idx}>
              <code>{url}</code>{" "}
              <button onClick={() => removeEndpoint(idx)}>Remove</button>
            </li>
          ))}
        </ul>
        <input
          placeholder="https://script.google.com/..."
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          style={{ width: "60%" }}
        />
        <button onClick={addEndpoint}>Add</button>
      </section>

      <section>
        <h3>Chat Rooms</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Last Activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.id}</td>
                <td>{room.lastActivityAt?.toDate?.()?.toLocaleString?.() || "-"}</td>
                <td>
                  <button onClick={() => deleteRoom(room.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
