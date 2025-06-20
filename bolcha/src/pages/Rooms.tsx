import { useEffect, useState } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import type { User } from "firebase/auth";

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");

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
    await addDoc(collection(db, "rooms"), {
      name: roomName.trim(),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    });
    setRoomName("");
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
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Rooms;
