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
import { detectLanguage } from "../langDetect";

import type { User } from "firebase/auth";
import { doc as fbDoc, getDoc } from "firebase/firestore";

// Translate only the most recent messages during batch processing
const MAX_TRANSLATE = 50;

type Message = {
  id: string;
  text: string;
  uid: string;
  createdAt: Date;
  readBy?: string[];
  likes?: string[];
  replyTo?: string;
  originalLang?: string; // ISO-639-1 code of source language
  translations?: Record<string, string>; // cached translations per language
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
  const [prefs, setPrefs] = useState<{ side: "left" | "right"; showOriginal: boolean; lang?: string }>({ side: "right", showOriginal: true });
  const [lang, setLang] = useState<string>(() => {
    return localStorage.getItem("chat_lang") || "en";
  });

  // persist language selection both locally and to Firestore
  useEffect(() => {
    localStorage.setItem("chat_lang", lang);
    import("firebase/firestore").then(({ doc, setDoc }) => {
      setDoc(doc(db, "users", user.uid), { lang }, { merge: true });
    });
  }, [lang, user.uid]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, { photoURL?: string }>>({});
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // focus input when reply target set
  useEffect(() => {
    if (replyTarget) {
      inputRef.current?.focus();
    }
  }, [replyTarget]);
  const containerRef = useRef<HTMLDivElement | null>(null);
const observerRef = useRef<IntersectionObserver | null>(null);
const translatingRef = useRef<Set<string>>(new Set());
  // track whether user is currently near the bottom (within 100px)
  const nearBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // load user preferences once on mount
  useEffect(() => {
    (async () => {
      const snap = await getDoc(fbDoc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        setPrefs((p) => ({ ...p, ...data }));
        if (data.lang) {
          setLang(data.lang);
        }
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
          replyTo: data.replyTo ?? null,
          translations: data.translations ?? {},
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
      // sync translations cache with Firestore and remove stale entries
      setTranslations(() => {
        const next: Record<string, string> = {};
        list.forEach((m) => {
          if (lang === m.originalLang) {
             next[m.id] = m.text;
           } else if (m.translations?.[lang]) {
             next[m.id] = m.translations[lang];
           }
        });
        return next;
      });
    });
    return unsub;
   }, [roomId]);

  // rebuild translation map when language changes or messages update
  useEffect(() => {
    setTranslations(() => {
      const next: Record<string, string> = {};
      messages.forEach((m) => {
        if (lang === m.originalLang) {
          next[m.id] = m.text;
        } else if (m.translations?.[lang]) {
          next[m.id] = m.translations[lang];
        }
      });
      return next;
    });
  }, [lang, messages]);

  // observe visibility of messages and translate only when they come into view
  // create IO once
  useEffect(() => {
    if (!containerRef.current || observerRef.current) return;
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const id = (entry.target as HTMLElement).dataset.msgId;
          if (!id) return;
          const message = messages.find((x) => x.id === id);
          if (!message) return;
          // if already cached translation, skip
          if (id in translations) return;
          // if original language matches selected, no translation
          if (message.originalLang === lang) {
            setTranslations((prev) => ({ ...prev, [id]: message.text }));
            observerRef.current?.unobserve(entry.target);
            return;
          }
          if (translatingRef.current.has(id)) return;
          translatingRef.current.add(id);
          const translated = await translateText(message.text, lang);
          translatingRef.current.delete(id);
          observerRef.current?.unobserve(entry.target);
          if (translated && translated !== message.text) {
            setTranslations((prev) => ({ ...prev, [id]: translated }));
            await updateDoc(doc(db, "rooms", roomId!, "messages", id), {
              [`translations.${lang}`]: translated,
            });
          } else if (translated === message.text) {
            setTranslations((prev) => ({ ...prev, [id]: message.text }));
          }
        }
      });
    }, { root: containerRef.current, threshold: 0.1 });
  }, []);

  // whenever messages render, observe new elements
  useEffect(() => {
    if (!observerRef.current || !containerRef.current) return;
    const els = containerRef.current.querySelectorAll('[data-msg-id]');
    els.forEach((el) => observerRef.current!.observe(el));
  }, [messages, lang]);

  // fallback: immediately translate any visible, untranslated messages (in case IO misses)
  useEffect(() => {
    if (!containerRef.current) return;
    const rootRect = containerRef.current.getBoundingClientRect();
    const els = containerRef.current.querySelectorAll('[data-msg-id]');
    els.forEach(async (el) => {
      const id = (el as HTMLElement).dataset.msgId;
      if (!id || id in translations || translatingRef.current.has(id)) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const visible = rect.bottom >= rootRect.top && rect.top <= rootRect.bottom;
      if (!visible) return;
      translatingRef.current.add(id);
      const msg = messages.find((x) => x.id === id);
      if (!msg) return;
      if (msg.originalLang === lang) {
        setTranslations((prev) => ({ ...prev, [id]: msg.text }));
        observerRef.current?.unobserve(el);
        return;
      }
      const translated = await translateText(msg.text, lang);
      translatingRef.current.delete(id);
      observerRef.current?.unobserve(el);
      if (translated && translated !== msg.text) {
        setTranslations((prev) => ({ ...prev, [id]: translated }));
        await updateDoc(doc(db, "rooms", roomId!, "messages", id), {
          [`translations.${lang}`]: translated,
        });
      }
    });
  }, [messages, lang]);

  // translate messages when language changes or new messages arrive
  // auto-scroll when messages change if user is near bottom
  useEffect(() => {
    if (nearBottomRef.current) {
      // wait for DOM paint
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [messages, lang]);

  useEffect(() => {
    const untranslated = messages
      .slice(-MAX_TRANSLATE)
      .reverse() // newest first
      .filter((m) => !(m.id in translations) && m.originalLang !== lang);
    if (!untranslated.length) return;

    (async () => {
      for (const m of untranslated) {
        if (translatingRef.current.has(m.id)) continue;
        translatingRef.current.add(m.id);
        const translated = await translateText(m.text, lang);
        translatingRef.current.delete(m.id);
        if (translated && translated !== m.text) {
          setTranslations((prev) => ({ ...prev, [m.id]: translated }));
          await updateDoc(doc(db, "rooms", roomId!, "messages", m.id), {
            [`translations.${lang}`]: translated,
          });
        }
      }
    })();
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
    const origLang = await detectLanguage(text.trim());
    if (!text.trim() || !roomId) return;
    const msgsRef = collection(db, "rooms", roomId, "messages");
    await addDoc(msgsRef, {
      replyTo: replyTarget?.id ?? null,
      text: text.trim(),
      uid: user.uid,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      originalLang: origLang,
      translations: {},
    });
    // update room lastActivityAt
    await updateDoc(doc(db, "rooms", roomId), {
      lastActivityAt: serverTimestamp(),
    });
    setText("");
    setReplyTarget(null);
    // auto-scroll to the latest message after sending
     nearBottomRef.current = true;
     setAtBottom(true);
    // wait for DOM update then scroll
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
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
            <option key={code} value={code as string}>
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
           const nb = distanceFromBottom < 100; // px threshold
           nearBottomRef.current = nb;
           setAtBottom(nb);
         }}
        style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}
      >
        {messages.map((m) => {
          const avatar = profiles[m.uid]?.photoURL ?? (m.uid === user.uid ? user.photoURL ?? undefined : undefined);
          const isMe = m.uid === user.uid;
          return (
            <div
              key={m.id}
              data-msg-id={m.id}
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
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.replyTo && (
                    <div style={{ borderLeft: "2px solid #999", paddingLeft: 4, marginBottom: 2, fontSize: "0.8em", color: "#555" }}>
                      {messages.find((x) => x.id === m.replyTo)?.text.slice(0, 60) ?? "…"}
                    </div>
                  )}
                  {translations[m.id] !== undefined ? translations[m.id] : m.text}
                {/* reply button */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplyTarget(m);
                  }}
                  style={{
                    cursor: "pointer",
                    marginLeft: 4,
                    fontSize: "0.9em",
                    opacity: hovered === m.id ? 1 : 0.6,
                  }}
                >
                  ↩︎
                </span>
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
                  <div style={{ fontSize: "0.8em", color: "#666", whiteSpace: "pre-wrap" }}>{m.text}</div>
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
      {replyTarget && (
        <div style={{ padding: "0.25rem 0.5rem", background: "#f1f1f1", borderLeft: "3px solid #999", fontSize: "0.8em" }}>
          Replying to: {replyTarget.text.slice(0, 40)}{replyTarget.text.length > 40 ? "…" : ""}
          <button style={{ marginLeft: 8 }} onClick={() => setReplyTarget(null)}>×</button>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem" }}>
        <textarea
          ref={inputRef}
          style={{ flex: 1, minHeight: 40 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type a message (Shift+Enterで改行)"
        />
        <button onClick={sendMessage}>Send</button>
       </div>
       {!atBottom && (
         <button
           onClick={() => {
             bottomRef.current?.scrollIntoView({ behavior: "smooth" });
           }}
           style={{
             position: "fixed",
             right: "3rem",
             bottom: "7rem",
             width: "36px",
             height: "36px",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             borderRadius: "50%",
             border: "1px solid #bbb",
             background: "rgba(255,255,255,0.8)",
             color: "#333",
             boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
             cursor: "pointer",
             fontSize: "1rem",
             lineHeight: 1,
           }}
           aria-label="Scroll to latest"
         >
           ↓
         </button>
       )}
     </div>
   );
}

export default ChatRoom;
