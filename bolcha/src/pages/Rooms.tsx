import { useEffect, useState } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, QueryDocumentSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
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
  const [duplicateError, setDuplicateError] = useState(false);
  const [autoDeleteInfo, setAutoDeleteInfo] = useState<string | null>(null);
  const [autoDeleteHours, setAutoDeleteHours] = useState<number>(24);
  // 現在時刻をstateで持ち、定期更新
  const [now, setNow] = useState<number>(new Date().getTime());
  // ルーム作成時警告ポップアップ
  const [showCreateWarning, setShowCreateWarning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().getTime()), 30000); // 30秒ごと
    return () => clearInterval(timer);
  }, [now]);

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

  useEffect(() => {
    const fetchAutoDeleteHours = async () => {
      try {
        const cfgSnap = await import("firebase/firestore").then(({ doc, getDoc }) => getDoc(doc(db, "admin", "config")));
        if (cfgSnap.exists()) {
          const d = cfgSnap.data();
          if (typeof d.autoDeleteHours === 'number') setAutoDeleteHours(d.autoDeleteHours);
        }
      } catch {}
    };
    fetchAutoDeleteHours();
  }, []);

  const createRoom = async () => {
    if (!roomName.trim()) return;
    // 全角2, 半角1でカウントし、36を超えたらエラー
    let len = 0;
    for (const c of roomName) {
      const isFull = /[^\u0000-\u007f]/.test(c);
      len += isFull ? 2 : 1;
    }
    if (len > 36) {
      alert("ルーム名は全角18文字または半角36文字までです。");
      return;
    }
    // 既存ルーム名重複チェック（大文字小文字・前後空白無視）
    const q = query(collection(db, "rooms"));
    const snap = await getDocs(q);
    const normalized = roomName.trim().toLowerCase();
    const exists = snap.docs.some((doc: QueryDocumentSnapshot<any>) => (doc.data().name ?? "").trim().toLowerCase() === normalized);
    if (exists) {
      setDuplicateError(true);
      setTimeout(() => setDuplicateError(false), 2500);
      return;
    }
    // FirestoreからautoDeleteHours取得
    let autoDeleteHours = 24;
    try {
      const cfgSnap = await import("firebase/firestore").then(({ doc, getDoc }) => getDoc(doc(db, "admin", "config")));
      if (cfgSnap.exists()) {
        const d = cfgSnap.data();
        if (typeof d.autoDeleteHours === 'number') autoDeleteHours = d.autoDeleteHours;
      }
    } catch {}
    const docRef = await addDoc(collection(db, "rooms"), {
      name: roomName.trim(),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
    });
    setRoomName("");
    setAutoDeleteInfo(`このルームは最終投稿から${autoDeleteHours}時間後に自動で削除されます。`);
    setTimeout(() => setAutoDeleteInfo(null), 6000);
    navigate(`/rooms/${docRef.id}`);
  };

  // 削除ボタン押下時にモーダルを表示
  const handleDeleteRoomClick = (roomId: string) => {
    setDeleteTarget(roomId);
  };

  // モーダルで「削除する」押下時の処理
  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      const functions = getFunctions();
      const deleteRoom = httpsCallable(functions, 'adminDeleteRoom');
      try {
        await deleteRoom({ roomId: deleteTarget });
      } catch (error) {
        console.error("Error deleting room:", error);
        // Handle error appropriately, e.g., show a notification to the user
      } finally {
        setDeleteTarget(null);
      }
    }
  };

  // モーダルで「キャンセル」押下時
  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  return (
    <div>
      <h3>Chat Rooms</h3>
      <div style={{ marginBottom: "1rem", position: 'relative' }}>
        {duplicateError && (
          <div style={{
            position: 'absolute',
            top: -32,
            left: 0,
            right: 0,
            background: '#fff0f0',
            color: '#d00',
            border: '1px solid #d00',
            borderRadius: 6,
            padding: '6px 12px',
            textAlign: 'center',
            zIndex: 10,
            fontSize: '0.97em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
          }}>
            同じ名前のルームが既に存在します
          </div>
        )}
        {autoDeleteInfo && (
          <div style={{
            position: 'absolute',
            top: -32,
            left: 0,
            right: 0,
            background: '#eef9ff',
            color: '#0077b6',
            border: '1px solid #0077b6',
            borderRadius: 6,
            padding: '6px 12px',
            textAlign: 'center',
            zIndex: 10,
            fontSize: '0.97em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
          }}>
            {autoDeleteInfo}
          </div>
        )}
        <input
          className="room-input"
          value={roomName}
          onChange={e => {
            // 全角2, 半角1でカウントし、合計36バイトまで許容
            const val = e.target.value;
            let len = 0;
            let result = '';
            for (const c of val) {
              // 半角: ASCII (U+0020-U+007E)、全角: それ以外
              // ただし、全角スペース(U+3000)も2バイト扱い
              const isFull = /[^\u0000-\u007f]/.test(c);
              len += isFull ? 2 : 1;
              if (len > 36) break;
              result += c;
            }
            setRoomName(result);
            setDuplicateError(false); // 入力時にエラー消す
            setAutoDeleteInfo(null); // 入力時に案内も消す
          }}
          placeholder="New room name"
        />
        <button className="room-create-btn" onClick={() => setShowCreateWarning(true)} disabled={!roomName.trim()}>Create</button>
        {(() => {
          let len = 0;
          for (const c of roomName) {
            const isFull = /[^\u0000-\u007f]/.test(c);
            len += isFull ? 2 : 1;
          }
          if (len === 36) {
            return <span style={{ color: 'red', marginLeft: 8, fontSize: '0.9em' }}>Max</span>;
          }
          return null;
        })()}
        {showCreateWarning && (
          <div style={{
            position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 1000,
            background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ background: '#fff', border: '2px solid #ffb300', borderRadius: 10, padding: '2rem 2.5rem', boxShadow: '0 6px 32px rgba(0,0,0,0.12)', minWidth: 320, maxWidth: '90vw', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2em', marginBottom: 8 }}>⚠️</div>
              <div style={{ color: '#b26a00', fontWeight: 600, fontSize: '1.08em', marginBottom: 18 }}>
                このルームは最終投稿から{autoDeleteHours}時間後に自動で削除されます<br />
                続行しますか？
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5em' }}>
                <button
                  style={{ background: '#ffb300', color: '#fff', border: 'none', borderRadius: 6, padding: '0.6em 2.2em', fontWeight: 600, fontSize: '1em', cursor: 'pointer' }}
                  onClick={async () => {
                    setShowCreateWarning(false);
                    await createRoom();
                  }}
                >OK</button>
                <button
                  style={{ background: '#eee', color: '#444', border: 'none', borderRadius: 6, padding: '0.6em 2.2em', fontSize: '1em', cursor: 'pointer' }}
                  onClick={() => setShowCreateWarning(false)}
                >キャンセル</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rooms.map((r) => {
          let remain = '';
          let diff = 0; // diffをここで初期化
          if (r.lastActivityAt) {
            const last = r.lastActivityAt.getTime();
            const expire = last + autoDeleteHours * 60 * 60 * 1000;
            diff = expire - now; // diffに値を代入
            if (diff <= 0) {
              remain = '削除対象';
            } else {
              const h = Math.floor(diff / (60 * 60 * 1000));
              const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
              remain = h > 0 ? `${h}時間${m}分` : `${m}分`;
            }
          }
          
          return (
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, lineHeight: '30px' }}>
              <Link to={`/rooms/${r.id}`}>{r.name}</Link>
              <span style={{ marginLeft: 8, color: '#1e90ff', fontWeight: 500, fontSize: '0.9em' }} title="参加者数">
                👥 {presenceCounts[r.id] === undefined ? '...' : presenceCounts[r.id] ?? 0}
              </span>
              <span style={{ marginLeft: 8, color: diff <= 0 ? '#d00' : '#555', fontWeight: 400, fontSize: '0.85em' }} title="自動削除までの残り時間">
                🕒 {remain}
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
          );
        })}
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
