import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";
import { translateText } from "../translation";
import type { User } from "firebase/auth";
import { doc as fbDoc, getDoc } from "firebase/firestore";

type Message = {
  id: string;
  text: string;
  uid: string;
  createdAt: Date;
  readBy?: string[]; // uids that have read this message
  likes?: string[]; // uids that liked this message
};

type Props = {
  user: User;
};

function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "#e0245e" : "none"}
      stroke={filled ? "#e0245e" : "#666"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "text-bottom" }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function formatTime(date: Date) {
  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatRoom({ user }: Props) {
  const { roomId } = useParams<{ roomId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prefs, setPrefs] = useState<{ side: "left" | "right"; showOriginal: boolean }>({ side: "right", showOriginal: true });
  const [lang, setLang] = useState<string>(() => {
    return localStorage.getItem("chat_lang") || "en";
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});

  // clear cached translations when language changes
  useEffect(() => {
    setTranslations({});
  }, [lang]);

  // persist language selection
  useEffect(() => {
    localStorage.setItem("chat_lang", lang);
  }, [lang]);
  const [profiles, setProfiles] = useState<Record<string, { photoURL?: string }>>({});
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // track whether user is currently near the bottom (within 100px)
  const nearBottomRef = useRef(true);

  // load user preferences once on mount
  useEffect(() => {
    (async () => {
      const snap = await getDoc(fbDoc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        setPrefs((p) => ({ ...p, ...data }));
      }
    })();
  }, [user.uid]);

  useEffect(() => {
    if (!roomId) return;
    const msgsRef = collection(db, "rooms", roomId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Message[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          text: data.text,
          uid: data.uid,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          readBy: data.readBy ?? [],
          likes: data.likes ?? [],
        };
      });
      setMessages(list);
      // mark unread messages as read
      const unread = list.filter((m) => m.uid !== user.uid && !(m.readBy ?? []).includes(user.uid));
      if (unread.length) {
        unread.forEach((m) => {
          updateDoc(doc(db, "rooms", roomId, "messages", m.id), {
            readBy: [...(m.readBy ?? []), user.uid],
          });
        });
      }
      // clear translations of messages no longer present
      setTranslations((prev) => {
        const next: Record<string, string> = {};
        list.forEach((m) => {
          if (prev[m.id]) next[m.id] = prev[m.id];
        });
        return next;
      });

    });
    return unsub;
  }, [roomId]);

  // translate messages when language changes or new messages arrive
  // auto-scroll when messages change if user is near bottom
  useEffect(() => {
    if (nearBottomRef.current) {
      // wait for DOM paint
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [messages]);

  useEffect(() => {
    const untranslated = messages
      .slice()
      .reverse() // newest first
      .filter((m) => !translations[m.id] && lang);
    if (!untranslated.length) return;

    let cancelled = false;
    (async () => {
      for (const m of untranslated) {
        const translated = await translateText(m.text, lang);
        if (cancelled) break;
        if (translated) {
          setTranslations((prev) => ({ ...prev, [m.id]: translated }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, lang]);

  // load / subscribe to user profiles referenced in messages
  useEffect(() => {
    const uids = Array.from(new Set(messages.map((m) => m.uid)));
    const unsubscribes: (() => void)[] = [];
    uids.forEach((uid) => {
      if (profiles[uid]) return; // already have
      const unsub = onSnapshot(fbDoc(db, "users", uid), (snap) => {
        setProfiles((prev) => ({ ...prev, [uid]: { photoURL: snap.data()?.photoURL } }));
      });
      unsubscribes.push(unsub);
    });
    return () => {
      unsubscribes.forEach((fn) => fn());
    };
  }, [messages, profiles]);

  const sendMessage = async () => {
    if (!text.trim() || !roomId) return;
    const msgsRef = collection(db, "rooms", roomId, "messages");
    await addDoc(msgsRef, {
      text: text.trim(),
      uid: user.uid,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
    });
    // update room lastActivityAt
    await updateDoc(doc(db, "rooms", roomId), {
      lastActivityAt: serverTimestamp(),
    });
    setText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "80vh" }}>
      <div style={{ padding: "0.5rem" }}>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {[
            ["en", "English"],
            ["ja", "日本語"],
            ["zh", "中文"],
            ["ko", "한국어"],
            ["es", "Español"],
            ["fr", "Français"],
          ].map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div
        ref={containerRef}
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          nearBottomRef.current = distanceFromBottom < 100; // px threshold
        }}
        style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}
      >
        {messages.map((m) => {
          const avatar = profiles[m.uid]?.photoURL ?? (m.uid === user.uid ? user.photoURL ?? undefined : undefined);
          const isMe = m.uid === user.uid;
          return (
            <div
              key={m.id}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                flexDirection: isMe ? "row-reverse" : "row",
                alignItems: "flex-end",
                margin: "0.25rem 0",
              }}
            >
              {avatar && (
                <img
                  src={avatar}
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  alt="avatar"
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", margin: isMe ? "0 0 0 6px" : "0 6px 0 0" }}
                />
              )}
              <span
                style={{
                  background: isMe ? "#dcf8c6" : "#fff",
                  padding: "0.4rem 0.6rem",
                  borderRadius: "4px",
                  display: "inline-block",
                  maxWidth: "80%",
                }}
              >
                {translations[m.id] ?? m.text}
                {/* like button */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!roomId) return;
                    const liked = (m.likes ?? []).includes(user.uid);
                    updateDoc(doc(db, "rooms", roomId, "messages", m.id), {
                      likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
                    });
                  }}
                  style={{
                    cursor: "pointer",
                    marginLeft: 6,
                    fontSize: "0.9em",
                    color: (m.likes ?? []).includes(user.uid) ? "#0b5ed7" : "#888",
                    opacity: ((m.likes ?? []).length > 0 || hovered === m.id) ? 1 : 0,
                    transition: "opacity 0.2s",
                  }}
                >
                  <LikeIcon filled={(m.likes ?? []).includes(user.uid)} />
                </span>
                {m.likes && m.likes.length > 0 && (
                  <span style={{ marginLeft: 4, fontSize: "0.8em", color: "#555" }}>{m.likes.length}</span>
                )}
                {prefs.showOriginal && translations[m.id] && translations[m.id] !== m.text && (
                  <div style={{ fontSize: "0.8em", color: "#666" }}>{m.text}</div>
                )}
                <div
                  style={{
                    fontSize: "0.7em",
                    color: "#999",
                    marginTop: "2px",
                    textAlign: isMe ? "right" : "left",
                  }}
                >
                  {formatTime(m.createdAt)}
                  {isMe && (
                    <span style={{ marginLeft: 4 }}>
                      {m.readBy && m.readBy.length > 1 ? "✔✔" : "✔"}
                    </span>
                  )}
                </div>
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem" }}>
        <input
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          placeholder="Type a message"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default ChatRoom;
