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
};

type Props = {
  user: User;
};

function ChatRoom({ user }: Props) {
  const { roomId } = useParams<{ roomId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prefs, setPrefs] = useState<{ side: "left" | "right"; showOriginal: boolean }>({ side: "right", showOriginal: true });
  const [lang, setLang] = useState<string>("en");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, { photoURL?: string }>>({});
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
        };
      });
      setMessages(list);
      // clear translations of messages no longer present
      setTranslations((prev) => {
        const next: Record<string, string> = {};
        list.forEach((m) => {
          if (prev[m.id]) next[m.id] = prev[m.id];
        });
        return next;
      });
      // scroll to bottom
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    });
    return unsub;
  }, [roomId]);

  // translate messages when language changes or new messages arrive
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
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {messages.map((m) => {
          const avatar = profiles[m.uid]?.photoURL ?? (m.uid === user.uid ? user.photoURL ?? undefined : undefined);
          const isMe = m.uid === user.uid;
          return (
            <div
              key={m.id}
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
                {prefs.showOriginal && translations[m.id] && translations[m.id] !== m.text && (
                  <div style={{ fontSize: "0.8em", color: "#666" }}>{m.text}</div>
                )}
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
