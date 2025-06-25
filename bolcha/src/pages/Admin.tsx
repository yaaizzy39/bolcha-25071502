import { useEffect, useState } from "react";
import { collection, getDocs, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import useIsAdmin from "../hooks/useIsAdmin";
import ConfirmModal from "../components/ConfirmModal";

export default function Admin({ user }: { user: User }) {
  const isAdmin = useIsAdmin(user);
  const [gasList, setGasList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [rooms, setRooms] = useState<any[]>([]);
  // room delete modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [autoDeleteHours, setAutoDeleteHours] = useState<number>(24);
  const [autoDeleteSaved, setAutoDeleteSaved] = useState(false);

  useEffect(() => {
    const cfgRef = doc(db, "admin", "config");
    const unsub = onSnapshot(cfgRef, (snap) => {
      const data = snap.data();
      setGasList(data?.gasEndpoints ?? []);
      if (typeof data?.autoDeleteHours === 'number') {
        setAutoDeleteHours(data.autoDeleteHours);
      }
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

  const saveAutoDeleteHours = async () => {
    const cfgRef = doc(db, "admin", "config");
    await setDoc(cfgRef, { autoDeleteHours }, { merge: true });
    setAutoDeleteSaved(true);
    setTimeout(() => setAutoDeleteSaved(false), 1800);
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

  // click trash icon → open modal
  const handleDeleteClick = (roomId: string) => {
    setDeleteTarget(roomId);
  };
  // modal confirm
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const callable = httpsCallable(functions, "adminDeleteRoom");
      await callable({ roomId: deleteTarget });
      setRooms((prev) => prev.filter((r) => r.id !== deleteTarget));
    } catch (err) {
      alert("Failed: " + (err as any).message);
    } finally {
      setDeleteTarget(null);
    }
  };
  const handleCancelDelete = () => setDeleteTarget(null);

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
      <section style={{ marginBottom: 24 }}>
        <h3>Room Auto-Delete</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="number"
            min={1}
            max={168}
            value={autoDeleteHours}
            onChange={e => setAutoDeleteHours(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span>時間（最終投稿からこの時間経過で自動削除）</span>
          <button onClick={saveAutoDeleteHours} style={{ marginLeft: 8 }}>保存</button>
          {autoDeleteSaved && <span style={{ color: 'green', marginLeft: 8 }}>保存しました</span>}
        </div>
      </section>
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
              <th>Room Name</th>
              <th>Last Activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms
              .slice()
              .sort((a, b) => {
                const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
                const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
                return bTime - aTime;
              })
              .map((room) => (
                <tr key={room.id}>
                  <td>{room.id}</td>
                  <td>{room.name || '-'}</td>
                  <td>{room.lastActivityAt?.toDate?.()?.toLocaleString?.() || "-"}</td>
                  <td>
                    <button onClick={() => handleDeleteClick(room.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <ConfirmModal
        open={!!deleteTarget}
        title="ルーム削除の確認"
        message="本当にこのルームを削除しますか？この操作は取り消せません。"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
