import { useEffect, useState } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "firebase/auth";
import useIsAdmin from "../hooks/useIsAdmin";

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

  useEffect(() => {
    const q = query(collection(db, "rooms"), orderBy("lastActivityAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
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

  // 追加: ルーム削除処理
  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm("本当にこのルームを削除しますか？")) return;
    await deleteDoc(doc(db, "rooms", roomId));
  };

  return (
    <div>
      <h3>Chat Rooms</h3>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="New room name"
        />
        <button onClick={createRoom}>Create</button>
      </div>
      <ul>
        {rooms.map((r) => (
          <li key={r.id}>
            <Link to={`/rooms/${r.id}`}>{r.name}</Link>
            {(r.createdBy === user.uid || isAdmin) && (
              <button style={{ marginLeft: 8 }} onClick={() => handleDeleteRoom(r.id)}>削除</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


export default Rooms;
