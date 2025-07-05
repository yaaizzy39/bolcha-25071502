import { useEffect, useState } from "react";
import { collection, getDocs, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import type { RoomData, UserPreferences } from "../types";
import useIsAdmin from "../hooks/useIsAdmin";
import ConfirmModal from "../components/ConfirmModal";

export default function Admin({ user }: { user: User }) {
  const isAdmin = useIsAdmin(user);
  const [gasList, setGasList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [rooms, setRooms] = useState<(RoomData & { id: string })[]>([]);
  // room delete modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [autoDeleteHours, setAutoDeleteHours] = useState<number>(24);
  const [autoDeleteSaved, setAutoDeleteSaved] = useState(false);
  const [enablePresenceCounter, setEnablePresenceCounter] = useState<boolean>(false);
  const [presenceCounterSaved, setPresenceCounterSaved] = useState(false);
  
  // Room limit settings
  const [maxRooms, setMaxRooms] = useState<number>(10);
  const [maxRoomsSaved, setMaxRoomsSaved] = useState(false);
  
  // user management state
  const [users, setUsers] = useState<(UserPreferences & { id: string })[]>([]);
  const [deleteUserTarget, setDeleteUserTarget] = useState<string | null>(null);
  const [deletedUsers, setDeletedUsers] = useState<Record<string, any>>({});

  useEffect(() => {
    const cfgRef = doc(db, "admin", "config");
    const unsub = onSnapshot(cfgRef, (snap) => {
      const data = snap.data();
      setGasList(data?.gasEndpoints ?? []);
      if (typeof data?.autoDeleteHours === 'number') {
        setAutoDeleteHours(data.autoDeleteHours);
      }
      if (typeof data?.enablePresenceCounter === 'boolean') {
        setEnablePresenceCounter(data.enablePresenceCounter);
      }
      if (typeof data?.maxRooms === 'number') {
        setMaxRooms(data.maxRooms);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchRooms = async () => {
      const snap = await getDocs(collection(db, "rooms"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() as RoomData }));
      setRooms(list);
    };
    fetchRooms();
  }, [isAdmin]);

  // Fetch users for admin management
  useEffect(() => {
    if (!isAdmin) return;
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() as UserPreferences }));
      setUsers(list);
    };
    fetchUsers();
  }, [isAdmin]);

  // Monitor deleted/blocked users
  useEffect(() => {
    if (!isAdmin) return;
    const deletedUsersRef = doc(db, "admin", "deletedUsers");
    const unsub = onSnapshot(deletedUsersRef, (doc) => {
      if (doc.exists()) {
        setDeletedUsers(doc.data());
      } else {
        setDeletedUsers({});
      }
    });
    return unsub;
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

  const savePresenceCounterSetting = async () => {
    const cfgRef = doc(db, "admin", "config");
    await setDoc(cfgRef, { enablePresenceCounter }, { merge: true });
    setPresenceCounterSaved(true);
    setTimeout(() => setPresenceCounterSaved(false), 1800);
  };

  const saveMaxRooms = async () => {
    const cfgRef = doc(db, "admin", "config");
    await setDoc(cfgRef, { maxRooms }, { merge: true });
    setMaxRoomsSaved(true);
    setTimeout(() => setMaxRoomsSaved(false), 1800);
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

  // User deletion functions
  const handleDeleteUserClick = (userId: string) => {
    // Prevent admin from deleting themselves
    if (userId === user.uid) {
      alert("You cannot delete your own account!");
      return;
    }
    setDeleteUserTarget(userId);
  };

  const handleConfirmUserDelete = async () => {
    if (!deleteUserTarget) return;
    try {
      // Get the user data before deletion to save display name
      const userToDelete = users.find(u => u.id === deleteUserTarget);
      const displayName = userToDelete?.displayName || deleteUserTarget;
      
      // Add user to deleted users list first (for immediate logout trigger)
      const deletedUsersRef = doc(db, "admin", "deletedUsers");
      await setDoc(deletedUsersRef, { 
        [deleteUserTarget]: { 
          deletedAt: new Date(),
          deletedBy: user.uid,
          displayName: displayName
        } 
      }, { merge: true });
      
      // Delete user document from Firestore
      await deleteDoc(doc(db, "users", deleteUserTarget));
      
      // Remove user from local state
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserTarget));
      
      alert("User deleted successfully");
    } catch (err) {
      alert("Failed to delete user: " + (err as any).message);
    } finally {
      setDeleteUserTarget(null);
    }
  };

  const handleCancelUserDelete = () => setDeleteUserTarget(null);

  // Unblock/restore user function
  const handleUnblockUser = async (userId: string) => {
    try {
      const deletedUsersRef = doc(db, "admin", "deletedUsers");
      const currentData = { ...deletedUsers };
      delete currentData[userId];
      
      if (Object.keys(currentData).length === 0) {
        // If no more blocked users, delete the document
        await deleteDoc(deletedUsersRef);
      } else {
        // Update the document without the unblocked user
        await setDoc(deletedUsersRef, currentData);
      }
      
      alert("User has been unblocked and can now log in again.");
    } catch (err) {
      alert("Failed to unblock user: " + (err as any).message);
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

      <section style={{ marginBottom: 24 }}>
        <h3>Presence Counter</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={enablePresenceCounter}
              onChange={e => setEnablePresenceCounter(e.target.checked)}
            />
            <span>プレゼンスカウンター機能を有効にする</span>
          </label>
          <button onClick={savePresenceCounterSetting} style={{ marginLeft: 8 }}>保存</button>
          {presenceCounterSaved && <span style={{ color: 'green', marginLeft: 8 }}>保存しました</span>}
        </div>
        <div style={{ fontSize: '0.9em', color: '#666', marginTop: 8 }}>
          無効にするとFirebaseへの書き込み回数を大幅に削減できます。各ルームで現在参加中の人数は表示されなくなります。
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>Room Limit</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>最大ルーム数:</span>
            <input
              type="number"
              min="0"
              value={maxRooms}
              onChange={e => setMaxRooms(parseInt(e.target.value) || 0)}
              style={{ width: 80, padding: '4px 8px' }}
            />
          </label>
          <button onClick={saveMaxRooms} style={{ marginLeft: 8 }}>保存</button>
          {maxRoomsSaved && <span style={{ color: 'green', marginLeft: 8 }}>保存しました</span>}
        </div>
        <div style={{ fontSize: '0.9em', color: '#666', marginTop: 8 }}>
          0を設定すると無制限になります。既存のルーム数が設定値を超えていても自動削除は行われません。
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

      <section style={{ marginTop: 32 }}>
        <h3>Registered Users</h3>
        <div style={{ marginBottom: 16, fontSize: "0.9em", color: "#666" }}>
          Total users: {users.length}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>User ID</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Display Name</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Avatar</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Language</th>
              <th style={{ textAlign: "center", padding: "8px 12px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users
              .slice()
              .sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id))
              .map((userData) => (
                <tr key={userData.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "0.85em" }}>
                    {userData.id}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {userData.displayName || "-"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {userData.photoURL ? (
                      <img 
                        src={userData.photoURL} 
                        alt="avatar" 
                        style={{ width: 24, height: 24, borderRadius: "50%" }}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {userData.lang || "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {userData.id === user.uid ? (
                      <span style={{ color: "#999", fontSize: "0.8em" }}>You</span>
                    ) : (
                      <button 
                        onClick={() => handleDeleteUserClick(userData.id)} 
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        title="Delete user"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {Object.keys(deletedUsers).length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3>Blocked/Deleted Users</h3>
          <div style={{ marginBottom: 16, fontSize: "0.9em", color: "#666" }}>
            These users are blocked from logging in. You can unblock them to restore access.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd" }}>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>User ID</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Display Name</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Deleted At</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Deleted By</th>
                <th style={{ textAlign: "center", padding: "8px 12px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(deletedUsers).map(([userId, data]) => (
                <tr key={userId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "0.85em" }}>
                    {userId}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {data.displayName || "-"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {data.deletedAt ? new Date(data.deletedAt.seconds * 1000).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "0.85em" }}>
                    {data.deletedBy || "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button 
                      onClick={() => handleUnblockUser(userId)} 
                      style={{ 
                        background: '#28a745', 
                        color: 'white',
                        border: 'none', 
                        borderRadius: '4px',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: '0.85em'
                      }}
                      title="Unblock user"
                    >
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="ルーム削除の確認"
        message="本当にこのルームを削除しますか？この操作は取り消せません。"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      
      <ConfirmModal
        open={!!deleteUserTarget}
        title="ユーザー削除の確認"
        message="本当にこのユーザーを削除しますか？この操作は取り消せません。ユーザーの設定情報が完全に削除されます。"
        onConfirm={handleConfirmUserDelete}
        onCancel={handleCancelUserDelete}
      />
    </div>
  );
}
