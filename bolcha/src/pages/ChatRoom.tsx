import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
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
import useIsAdmin from "../hooks/useIsAdmin";
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
  const isAdmin = useIsAdmin(user);
  const { roomId } = useParams<{ roomId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomName, setRoomName] = useState<string>("");
  const [userPrefs, setUserPrefs] = useState<Record<string, { photoURL?: string; bubbleColor?: string; textColor?: string; displayName?: string }>>({});
  const [prefs, setPrefs] = useState<{ side: "left" | "right"; showOriginal: boolean; lang?: string; bubbleColor?: string; textColor?: string }>({ side: "right", showOriginal: true });
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
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null);
  const l10n = {
    confirm: lang.startsWith("ja") ? "このメッセージを削除しますか？" : "Delete this message?",
    del: lang.startsWith("ja") ? "削除" : "Delete",
    cancel: lang.startsWith("ja") ? "キャンセル" : "Cancel",
  };
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
          originalLang: data.originalLang ?? undefined,
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
  // subscribe room doc for name
  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      if (snap.exists()) {
        setRoomName(snap.data().name ?? "");
      }
    });
    return unsub;
  }, [roomId]);

  // load current user's prefs on mount
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(fbDoc(db, "users", user.uid));
        if (snap.exists()) {
          setPrefs((p) => ({ ...p, ...(snap.data() as any) }));
        }
      } catch {}
    })();
  }, [user.uid]);

  // fetch missing user prefs when messages change
  useEffect(() => {
    const missing = Array.from(new Set(messages.map(m => m.uid))).filter(uid => !(uid in userPrefs));
    if (missing.length === 0) return;
    missing.forEach(async (uid) => {
      try {
        const snap = await getDoc(fbDoc(db, "users", uid));
        if (snap.exists()) {
          setUserPrefs(prev => ({ ...prev, [uid]: snap.data() as any }));
        } else {
          setUserPrefs(prev => ({ ...prev, [uid]: {} }));
        }
      } catch {}
    });
  }, [messages]);

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
      if (!msg.originalLang) return; // language not determined yet
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
      .filter((m) => m.originalLang && !(m.id in translations) && m.originalLang !== lang);
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

  // helper: ensure 2-letter lowercase code
const normalizeLang = (c: string | undefined | null) => (c || 'en').slice(0,2).toLowerCase();

const sendMessage = async () => {
    if (!text.trim() || !roomId) return;
    const origLangRaw = await detectLanguage(text.trim());
    const origLang = normalizeLang(origLangRaw);
    const trimmed = text.trim();

    const msgsRef = collection(db, "rooms", roomId, "messages");
    // prepare initial doc data
  const docData: any = {
    replyTo: replyTarget?.id ?? null,
    text: trimmed,
    uid: user.uid,
    createdAt: serverTimestamp(),
    readBy: [user.uid],
    originalLang: origLang,
    translations: {},
  };
  // if same language, store translation stub to Firestore
  if (origLang === lang) {
    docData.translations = { [lang]: trimmed };
  }
  const docRef = await addDoc(msgsRef, docData);
    // update room lastActivityAt
    // if same language, also update local cache to prevent API call
  if (origLang === lang) {
    setTranslations(prev => ({ ...prev, [docRef.id]: trimmed }));
  }

  await updateDoc(doc(db, "rooms", roomId), {
      lastActivityAt: serverTimestamp(),
    });
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setReplyTarget(null);
    // auto-scroll to the latest message after sending
     nearBottomRef.current = true;
     setAtBottom(true);
    // wait for DOM update then scroll
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  };

  // translate messages lacking current lang when dropdown changes
  useEffect(() => {
    if (!roomId) return;
    const candidates = messages.filter(
      (m) => m.originalLang && m.originalLang !== lang && !m.translations?.[lang]
    );
    if (!candidates.length) return;
    (async () => {
      for (const m of candidates.slice(0, MAX_TRANSLATE)) {
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
  }, [lang, messages, roomId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "80vh" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.5rem 0 0.2rem", minHeight: 36 }}>
        <span style={{ fontWeight: 700, fontSize: "1.2rem", letterSpacing: 1, margin: 0 }}>{roomName}</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ marginLeft: 8, height: 28, fontSize: "1rem", borderRadius: 6, border: "1px solid #ccc", padding: "0 8px" }}>
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
        style={{ flex: 1, overflowY: "auto", padding: "0.5rem", position: "relative" }}
      >
        {messages.map((m) => {
           const isMe = m.uid === user.uid;
           const avatar = userPrefs[m.uid]?.photoURL || (isMe ? user.photoURL : undefined) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23ddd'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%23bbb'/%3E%3Cellipse cx='16' cy='24' rx='9' ry='6' fill='%23bbb'/%3E%3C/svg%3E";
            const myDir = isMe ? (prefs.side === "right" ? "row-reverse" : "row") : "row";
           const bubbleBg = isMe ? (prefs.bubbleColor ?? "#dcf8c6") : (userPrefs[m.uid]?.bubbleColor ?? "#fff");
            const textColor = isMe ? (prefs.textColor ?? "#000") : (userPrefs[m.uid]?.textColor ?? "#000");
          return (
            <div
              key={m.id}
              data-msg-id={m.id}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: myDir,
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
                  style={{ borderRadius: "50%", margin: myDir === "row-reverse" ? "0 0 0 6px" : "0 6px 0 0" }}
                />
              )}
              <span
                style={{
                  background: bubbleBg,
                  color: textColor,
                  padding: "0.4rem 0.6rem",
                  borderRadius: "16px",
                  display: "inline-block",
                  maxWidth: 420,
                  width: "fit-content",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  position: "relative"
                }}
              >
                {m.replyTo && (
                    <div style={{ borderLeft: "2px solid #999", paddingLeft: 4, marginBottom: 2, fontSize: "0.8em", color: "#555" }}>
                      {messages.find((x) => x.id === m.replyTo)?.text.slice(0, 60) ?? "…"}
                    </div>
                  )}
                  {translations[m.id] !== undefined ? translations[m.id] : m.text}
                  {hovered === m.id && (
                    <div style={{
                      position: "absolute",
                      left: 10,
                      bottom: 8,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      padding: "2px 8px",
                      borderRadius: 8,
                      fontSize: "0.85em",
                      maxWidth: 180,
                      textAlign: "left",
                      pointerEvents: "none",
                      zIndex: 2
                    }}>
                      {userPrefs[m.uid]?.displayName || (isMe ? user.displayName : "Unknown")}
                    </div>
                  )}
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
                {/* delete button */}
                {(isAdmin || isMe) && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!roomId) return;
                      setConfirmDelete(m);
                    }}
                    style={{ cursor: "pointer", marginLeft: 6, fontSize: "0.9em", opacity: hovered === m.id ? 1 : 0 }}
                  >🗑️</span>
                )}
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
                    textAlign: "right",
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
      {confirmDelete && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: "1rem 1.5rem", borderRadius: 8, maxWidth: 320, textAlign: "center" }}>
            <p>{l10n.confirm}</p>
            <p style={{ fontSize: "0.9em", color: "#555", whiteSpace: "pre-wrap" }}>
              {confirmDelete.text.length > 60 ? confirmDelete.text.slice(0, 60) + "…" : confirmDelete.text}
            </p>
            <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center", gap: "1rem" }}>
              <button onClick={async () => {
                if (!roomId || !confirmDelete) return;
                await deleteDoc(doc(db, "rooms", roomId, "messages", confirmDelete.id));
                setConfirmDelete(null);
              }}>{l10n.del}</button>
              <button onClick={() => setConfirmDelete(null)}>{l10n.cancel}</button>
            </div>
          </div>
        </div>
      )}
      {replyTarget && (
        <div style={{ padding: "0.25rem 0.5rem", background: "#f1f1f1", borderLeft: "3px solid #999", fontSize: "0.8em" }}>
          Replying to: {replyTarget.text.slice(0, 40)}{replyTarget.text.length > 40 ? "…" : ""}
          <button style={{ marginLeft: 8 }} onClick={() => setReplyTarget(null)}>×</button>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem", position: "relative" }}>
        {!atBottom && (
          <button
            onClick={() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            style={{
              position: "absolute",
              right: 56,
              top: -40,
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
              zIndex: 20
            }}
            aria-label="Scroll to latest"
          >
            ↓
          </button>
        )}
        <textarea
          ref={inputRef}
          style={{
            flex: 1,
            height: 40,
            maxHeight: 200,
            border: "1px solid #ccc",
            borderRadius: "20px",
            padding: "0 10px",
            lineHeight: "40px",
            fontSize: "1rem",
            outline: "none",
            overflow: "hidden",
            resize: "none"
          }}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Message"
        />
        <button
          onClick={sendMessage}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="#0b5ed7"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
       </div>

     </div>
   );
}

export default ChatRoom;
