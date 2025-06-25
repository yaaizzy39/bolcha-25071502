import { useEffect, useState } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import useIsAdmin from "../hooks/useIsAdmin";
import ConfirmModal from "../components/ConfirmModal";

type Room = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  lastActivityAt: Date;
};

type Props = {
  user: User;
};

function Rooms({ user }: Props) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const isAdmin = useIsAdmin(user);
  const [presenceCounts, setPresenceCounts] = useState<Record<string, number | null>>({});
  // 削除確認モーダル用の状態
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "rooms"), orderBy("lastActivityAt", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const list: Room[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          lastActivityAt: data.lastActivityAt?.toDate?.() ?? new Date(),
        };
      });
      setRooms(list);
      // presenceカウント取得
      const now = Date.now();
      const counts: Record<string, number | null> = {};
      await Promise.all(list.map(async (room) => {
        try {
          const presSnap = await import("firebase/firestore").then(({ collection, getDocs }) =>
            getDocs(collection(db, "rooms", room.id, "presence"))
          );
          let count = 0;
          presSnap.forEach((doc) => {
            const last = doc.data().lastActive;
            let t = null;
            if (!last) return;
            t = last.toDate ? last.toDate().getTime() : new Date(last).getTime();
            if (now - t < 3 * 60 * 1000) count++;
          });
          counts[room.id] = count;
        } catch {
          counts[room.id] = null;
        }
      }));
      setPresenceCounts(counts);
    });
    return unsub;
  }, []);

  const createRoom = async () => {
    if (!roomName.trim()) return;
    const docRef = await addDoc(collection(db, "rooms"), {
      name: roomName.trim(),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    });
    setRoomName("");
    navigate(`/rooms/${docRef.id}`);
  };

  // 削除ボタン押下時にモーダルを表示
  const handleDeleteRoomClick = (roomId: string) => {
    setDeleteTarget(roomId);
  };

  // モーダルで「削除する」押下時の処理
  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await deleteDoc(doc(db, "rooms", deleteTarget));
      setDeleteTarget(null);
    }
  };

  // モーダルで「キャンセル」押下時
  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  return (
    <div>
      <h3>Chat Rooms</h3>
      <div style={{ marginBottom: "1rem" }}>
        <input
          className="room-input"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="New room name"
        />
        <button className="room-create-btn" onClick={createRoom}>Create</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rooms.map((r) => (
          <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, lineHeight: '30px' }}>
            <Link to={`/rooms/${r.id}`}>{r.name}</Link>
            <span style={{ marginLeft: 8, color: '#1e90ff', fontWeight: 500, fontSize: '0.9em' }} title="参加者数">
              👥 {presenceCounts[r.id] === undefined ? '...' : presenceCounts[r.id] ?? 0}
            </span>
            {(r.createdBy === user.uid || isAdmin) ? (
              <button
                className="trash-btn"
                style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', verticalAlign: 'middle' }}
                title="ルームを削除"
                onClick={() => handleDeleteRoomClick(r.id)}
              >
                {/* ゴミ箱アイコン */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            ) : (
              <span style={{ display: 'inline-block', width: 24, height: 20 }} />
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        open={!!deleteTarget}
        title="ルーム削除の確認"
        message={
          deleteTarget
            ? `本当にこのルーム「${rooms.find(r => r.id === deleteTarget)?.name ?? ''}」を削除しますか？この操作は取り消せません。`
            : "本当にこのルームを削除しますか？この操作は取り消せません。"
        }
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}

export default Rooms;
