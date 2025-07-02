import * as React from 'react';
import { useEffect, useState, useRef, useMemo, useLayoutEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { setDoc } from "firebase/firestore";
import { translateText } from "../translation";
import useIsAdmin from "../hooks/useIsAdmin";
import { detectLanguage } from "../langDetect";
import { useI18n } from "../i18n";

import type { User } from "firebase/auth";
import { doc as fbDoc, getDoc } from "firebase/firestore";



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

function formatTime(date: Date, lang: string) {
  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();
  if (lang === 'en') {
    // Always use English locale
    if (sameDay) {
      return date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString('en-US', { month: "short", day: "numeric", year: "numeric" }) +
      ", " +
      date.toLocaleTimeString('en-US', { hour: "2-digit", minute: "2-digit" });
  } else {
    if (sameDay) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

function ChatRoom({ user }: Props) {
  // --- Room Deletion and Auto-Delete Warning State ---
  const navigate = useNavigate();

  const [autoDeleteWarning, setAutoDeleteWarning] = useState<string | null>(null);
  const [autoDeleteHours, setAutoDeleteHours] = useState<number>(24);
  const [lastActivityAt, setLastActivityAt] = useState<Date | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  // presence管理用
  const [presenceCount, setPresenceCount] = useState(0);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ...既存のstate...
  const [pendingLink, setPendingLink] = useState<{ url: string; label: string } | null>(null);

  const isAdmin = useIsAdmin(user);
  const { roomId } = useParams<{ roomId: string }>();
  // UI language from global context
  const { lang: uiLang } = useI18n();

  // presence: ルーム入室時に自分を追加・定期更新、離脱時に削除
  useEffect(() => {
    if (!roomId || !user?.uid) return;
    const presenceRef = doc(db, "rooms", roomId, "presence", user.uid);
    // const now = new Date(); // 未使用のためコメントアウト
    const updatePresence = async () => {
      await updateDoc(presenceRef, { lastActive: new Date() }).catch(async err => {
        // ドキュメントがなければset
        if (err.code === "not-found" || err.message?.includes("No document")) {
          await setDoc(presenceRef, { lastActive: new Date(), uid: user.uid });
        }
      });
    };
    updatePresence();
    presenceIntervalRef.current = setInterval(updatePresence, 30000); // 30秒ごと
    // 離脱時にpresence削除
    return () => {
      clearInterval(presenceIntervalRef.current!);
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [roomId, user?.uid]);

  // presence人数をリアルタイム取得
  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, "rooms", roomId, "presence")
    );
    const unsub = onSnapshot(q, (snap) => {
      // DEBUG: Log snapshot docs
       
      const now = Date.now();
      const debugList = snap.docs.map(d => {
        const last = d.data().lastActive;
        let t = null;
        if (!last) return { uid: d.id, lastActive: null };
        t = last.toDate ? last.toDate().getTime() : new Date(last).getTime();
        return { uid: d.id, lastActive: t, delta: now - t };
      });
       
      const count = debugList.filter(item => item.lastActive && (now - item.lastActive < 3 * 60 * 1000)).length;
       
      setPresenceCount(count);
    });
    return unsub;
  }, [roomId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [roomName, setRoomName] = useState<string>("");
  const [userPrefs, setUserPrefs] = useState<Record<string, { photoURL?: string; bubbleColor?: string; textColor?: string; displayName?: string }>>({});
  const [prefs, setPrefs] = useState<{
    side: "left" | "right";
    showOriginal: boolean;
    lang?: string;
    bubbleColor?: string;
    textColor?: string;
  }>(() => {
    // Try to load from localStorage first for fast UI
    try {
      const stored = localStorage.getItem("chat_prefs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return { side: "right", showOriginal: true };
  });
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
  const [profiles, setProfiles] = useState<Record<string, { photoURL?: string }>>({});

  // Derived state for translations using useMemo
  const translations = useMemo(() => {
    const currentTranslations: Record<string, string> = {};
    messages.forEach(m => {
      if (m.translations && m.translations[lang]) {
        currentTranslations[m.id] = m.translations[lang];
      } else if (m.originalLang === lang) {
        currentTranslations[m.id] = m.text;
      }
    });
    return currentTranslations;
  }, [messages, lang]);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Refs for scrolling container and sentinel element at bottom
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const translatedIdsRef = useRef<Set<string>>(new Set());
  // Reset translated ID cache when language changes
  useEffect(() => {
    translatedIdsRef.current = new Set(
      JSON.parse(sessionStorage.getItem(`translated-${lang}`) || '[]')
    );
  }, [lang]);
  const saveTranslatedId = (id: string) => {
    translatedIdsRef.current.add(id);
    sessionStorage.setItem(`translated-${lang}`, JSON.stringify(Array.from(translatedIdsRef.current)));
  };

  // NOTE: 以前は IntersectionObserver でスクロール位置を判定していましたが、
  // Sentinel 要素が高さ 0 のため誤検知が起こるケースがありました。
  // 現在は単純にスクロールイベントとリアルタイム計算（isAtBottom）に統一しています。
  // userHasScrolledUp は handleScroll とメッセージ更新後の isAtBottom() の結果で更新します。

  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
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

  const translatingRef = useRef<Set<string>>(new Set());
  // Scroll-related state and refs have been temporarily removed for diagnostics.

  // Firestore: subscribe to messages in real-time
  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs: Message[] = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          uid: data.uid,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          readBy: data.readBy,
          likes: data.likes,
          replyTo: data.replyTo,
          originalLang: data.originalLang,
          translations: data.translations,
        };
      });
      setMessages(msgs);
    });
    return unsub;
  }, [roomId]);

  // load user preferences once on mount
  useEffect(() => {
    (async () => {
      // Try to load from Firestore
      try {
        const snap = await getDoc(fbDoc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setPrefs((p) => {
            const merged = { ...p, ...data };
            // Persist to localStorage for next reload
            try {
              localStorage.setItem("chat_prefs", JSON.stringify(merged));
            } catch {}
            return merged;
          });
          if (data.lang) {
            setLang(data.lang);
          }
        }
      } catch {
        // If Firestore fails, try to restore from localStorage (already done in initialState)
      }
    })();
  }, [user.uid]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      if (snap.exists()) {
        setRoomName(snap.data().name ?? "");
        const data = snap.data();
        // Track lastActivityAt for warning
        if (data.lastActivityAt && typeof data.lastActivityAt.toDate === 'function') {
          setLastActivityAt(data.lastActivityAt.toDate());
        }
        // Get autoDeleteHours from config (admin/config)
        import("firebase/firestore").then(({ doc, getDoc }) => {
          getDoc(doc(db, "admin", "config")).then(cfgSnap => {
            if (cfgSnap.exists()) {
              const d = cfgSnap.data();
              if (typeof d.autoDeleteHours === 'number') setAutoDeleteHours(d.autoDeleteHours);
            }
          });
        });
        
      } else {
        
        setTimeout(() => {
          navigate("/rooms");
        }, 2200);
      }
    });
    return unsub;
  }, [roomId, navigate]);

  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
// スクロール関連ヘルパー
const getBottomDistance = () => {
  const el = containerRef.current;
  // container が存在しスクロールバーが出ている場合はこちらを使用
  if (el && el.scrollHeight > el.clientHeight) {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }
  // そうでない場合は window スクロール量で判定
  return document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
};

const isAtBottom = () => getBottomDistance() < 40;
const prevMessageCount = useRef(messages.length);

// 新着メッセージ時の自動スクロール判定
useLayoutEffect(() => {
  if (messages.length > prevMessageCount.current) {
    const firstLoad = prevMessageCount.current === 0;
     
    if (firstLoad || !userHasScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }
  prevMessageCount.current = messages.length;
}, [messages]);



// 部屋切り替え時は必ず最下部へ
useEffect(() => {
  bottomRef.current?.scrollIntoView();
  setUserHasScrolledUp(false);
}, [roomId]);

// スクロールイベントハンドラ (container)
const handleContainerScroll = () => {

  const bottomDistance = getBottomDistance();
  const scrolledUp = bottomDistance > 40;
  setUserHasScrolledUp(scrolledUp);
};

// window 用ハンドラは不要になったため削除

// window listener attach




  // Show warning 1 minute before auto-delete (always show if within 1 minute, even if room is deleted soon after)
  useEffect(() => {
    if (!lastActivityAt || !autoDeleteHours) {
      setAutoDeleteWarning(null);
      return;
    }
    // Use the system's current local time for accurate calculation
    const now = new Date().getTime();
    const expireAt = lastActivityAt.getTime() + autoDeleteHours * 60 * 60 * 1000;
    const msLeft = expireAt - now;
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    let warningMsg = '';
    if (uiLang && uiLang.startsWith('ja')) {
      warningMsg = '⚠️ このまま新しい投稿が無い場合、このルームはおよそ５分後に削除されます。';
    } else {
      warningMsg = '⚠️ If there are no new posts, this room will be deleted in about 5 minutes.';
    }
    if (msLeft > 60 * 1000) {
      setAutoDeleteWarning(null);
      // set timer to show warning at right time
      warningTimerRef.current = setTimeout(() => {
        setAutoDeleteWarning(warningMsg);
      }, msLeft - 60 * 1000);
    } else if (msLeft > 0) {
      setAutoDeleteWarning(warningMsg);
    } else {
      setAutoDeleteWarning(null);
    }
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [lastActivityAt, autoDeleteHours, lang]);

  // load current user's prefs on mount
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(fbDoc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          setPrefs((p) => {
            const merged = { ...p, ...data };
            // Persist to localStorage for next reload
            try {
              localStorage.setItem("chat_prefs", JSON.stringify(merged));
            } catch {}
            return merged;
          });
          if (data.lang) {
            setLang(data.lang);
          }
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
        // Try to load from localStorage for current user, else Firestore
        if (uid === user.uid) {
          try {
            const stored = localStorage.getItem("chat_prefs");
            if (stored) {
              setUserPrefs(prev => ({ ...prev, [uid]: JSON.parse(stored) }));
              return;
            }
          } catch {}
        }
        const snap = await getDoc(fbDoc(db, "users", uid));
        if (snap.exists()) {
          setUserPrefs(prev => ({ ...prev, [uid]: snap.data() as any }));
        } else {
          setUserPrefs(prev => ({ ...prev, [uid]: {} }));
        }
      } catch {}
    });
  }, [messages]);


  /* ---------- Translation helpers ---------- */
  
    if (!roomId || !lang) return;
    const container = containerRef.current;
    if (!container) return; // require container
    
    const elements = Array.from(container.querySelectorAll('[data-msg-id]')) as HTMLElement[];
    // iterate from newest (bottom) to oldest
    elements.reverse();
    let processed = 0;
    const MAX_PER_CALL = 5;
    const containerRect = container.getBoundingClientRect();
    
    elements.forEach((el) => {
      if (processed >= MAX_PER_CALL) return;
      const rect = el.getBoundingClientRect();
      const visible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
      
      if (!visible) { return; }
      const id = el.getAttribute('data-msg-id');
      if (!id) return;
      const msg = messages.find((m) => m.id === id);
      if (!msg) return;

      const { translations, originalLang } = msg;
      if (translatedIdsRef.current.has(id)) return;
      if (translatingRef.current.has(id)) return;
      if (translations?.[lang]) return;
      if (originalLang === lang) return;

      (async () => {
        try {
          translatingRef.current.add(id);
          processed++; // count before awaiting to enforce per-call limit
          const translated = await translateText(msg.text, lang);
          if (translated && translated !== msg.text) {
            await updateDoc(doc(db, 'rooms', roomId!, 'messages', id), {
              [`translations.${lang}`]: translated,
            });
            saveTranslatedId(id);
          }
        } catch (err) {
          console.error('[Translation] On-demand error', err);
        } finally {
          translatingRef.current.delete(id);
        }
      })();
    });
    
  // ----- IntersectionObserver for on-demand translation (more reliable than scroll handler) -----
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !roomId || !lang) return;

    const MAX_IO_CALLS = 5;

    const observer = new IntersectionObserver((entries) => {
      let ioProcessed = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting || ioProcessed >= MAX_IO_CALLS) return;
        const el = entry.target as HTMLElement;
        const id = el.getAttribute('data-msg-id');
        if (!id) return;
        const msg = messages.find((m) => m.id === id);
        if (!msg) return;
        const { originalLang, translations } = msg;
        if (translatedIdsRef.current.has(id)) return;
        if (translatingRef.current.has(id)) return;
        if (translations?.[lang]) return;
        if (originalLang === lang) return;

        ioProcessed++;
        (async () => {
          try {
            translatingRef.current.add(id);
            const translated = await translateText(msg.text, lang);
            if (translated && translated !== msg.text) {
              await updateDoc(doc(db, 'rooms', roomId, 'messages', id), {
                [`translations.${lang}`]: translated,
              });
              saveTranslatedId(id);
            }
          } catch (err) {
            console.error('[Translation] IO on-demand error', err);
          } finally {
            translatingRef.current.delete(id);
            observer.unobserve(el); // translate once per lang
          }
        })();
      });
    }, {
      root: container,
      threshold: 0.1,
      rootMargin: '0px',
    });

    // Observe current visible elements after a short delay (allow DOM to paint)
    const timer = setTimeout(() => {
      const containerRect = container.getBoundingClientRect();
      const els = Array.from(container.querySelectorAll('[data-msg-id]')) as HTMLElement[];
      els.forEach((el) => {
        const id = el.getAttribute('data-msg-id');
        if (!id) return;
        if (translatedIdsRef.current.has(id)) return;
        observer.observe(el);
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [messages, lang, roomId]);

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
  const normalizeLang = (c: string | undefined | null) => (c || 'en').slice(0, 2).toLowerCase();

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
      createdBy: user.uid, // Firestoreルール対応のため追加
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      originalLang: origLang,
      translations: {},
    };
    // if same language, store translation stub to Firestore
    if (origLang === lang) {
      docData.translations = { [lang]: trimmed };
    }
    await addDoc(msgsRef, docData);
    // update room lastActivityAt
    // if same language, also update local cache to prevent API call
    // No need to call setTranslations here as it's derived from messages
    // The addDoc will trigger a messages update, which will re-derive translations

    try {
      await updateDoc(doc(db, "rooms", roomId), {
        lastActivityAt: serverTimestamp(),
      });
    } catch (err: any) {
      if ((err as Error).message?.includes("permission")) {
        // Not critical; ignore to prevent console noise
        
      } else {
        throw err;
      }
    }
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setReplyTarget(null);
  };

  

  return (
    <>
      {/* Show auto-delete warning bar at the very top if needed */}
      {autoDeleteWarning && (
        <div style={{ background: '#fff3cd', color: '#856404', fontWeight: 700, padding: '8px 18px', fontSize: '1.12em', borderBottom: '2px solid #ffeeba', letterSpacing: 0.5, zIndex: 9998, width: '100%', textAlign: 'center' }}>
          {autoDeleteWarning}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", maxWidth: 1000, width: "100%", margin: "0 auto" }}>
        <div style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0.5rem 0 0.2rem",
            minHeight: 36,
            position: "sticky",
            top: 44,
            background: "#fff",
            zIndex: 50,
            boxShadow: "0 2px 1px rgba(0,0,0,0.06)"
          }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span title="現在アクセス中の人数" style={{ fontWeight: 500, fontSize: '1rem', color: '#1e90ff' }}>
            👥 {presenceCount}
          </span>
          <span style={{ fontWeight: 700, fontSize: "1.2rem", letterSpacing: 1, margin: 0 }}>{roomName}</span>
        </div>
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
        onScroll={handleContainerScroll}
        style={{ flex: 1, overflowY: "auto", padding: "0.5rem", position: "relative", marginTop: 44 }}
      >
        {messages.map((m) => {
          const isMe = m.uid === user.uid;
          const avatar = userPrefs[m.uid]?.photoURL || (isMe ? user.photoURL : undefined) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23ddd'/%3E%3Ccircle cx='16' cy='13' r='6' fill='%23bbb'/%3E%3Cellipse cx='16' cy='24' rx='9' ry='6' fill='%23bbb'/%3E%3C/svg%3E";
          const myDir = isMe ? (prefs.side === "right" ? "row-reverse" : "row") : "row";
          const bubbleBg = isMe ? (prefs.bubbleColor ?? "#dcf8c6") : (userPrefs[m.uid]?.bubbleColor ?? "#fff");
          const textColor = isMe ? (prefs.textColor ?? "#000") : (userPrefs[m.uid]?.textColor ?? "#000");
          // If the user changed their color in another tab, update from localStorage
          if (isMe) {
            try {
              const stored = localStorage.getItem("chat_prefs");
              if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.bubbleColor && parsed.bubbleColor !== prefs.bubbleColor) setPrefs(p => ({ ...p, bubbleColor: parsed.bubbleColor }));
                if (parsed.textColor && parsed.textColor !== prefs.textColor) setPrefs(p => ({ ...p, textColor: parsed.textColor }));
              }
            } catch {}
          }
          return (
            <div
              key={m.id}
              data-msg-id={m.id}
              onMouseEnter={() => setHoveredUser(m.id)}
              onMouseLeave={() => setHoveredUser(null)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: myDir,
                alignItems: "flex-start",
                margin: "0.25rem 0",
              }}
            >

              {avatar && (
                <>
                  <img
                    src={avatar}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    alt="avatar"
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", margin: myDir === "row-reverse" ? "0 0.2em 0 6px" : "0 6px 0.2em 0", cursor: "pointer", verticalAlign: "top" }}
                    onMouseEnter={() => setHoveredUser(`avatar-${m.id}`)}
                    onMouseLeave={() => setHoveredUser(null)}
                  />
                  {hoveredUser === `avatar-${m.id}` && (
                    <div style={{
                      position: "absolute",
                      background: "#222",
                      color: "#fff",
                      padding: "4px 12px",
                      borderRadius: 8,
                      fontSize: "0.95em",
                      top: 36,
                      left: myDir === "row-reverse" ? undefined : 38,
                      right: myDir === "row-reverse" ? 38 : undefined,
                      zIndex: 100,
                      whiteSpace: "nowrap",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.18)"
                    }}>
                      {userPrefs[m.uid]?.displayName || (isMe ? user.displayName : "") || "(No name)"}
                    </div>
                  )}
                </>
              )}
              <span
                style={{
                  background: bubbleBg,
                  color: textColor,
                  padding: "0.4rem 0.6rem",
                  borderRadius: "16px",
                  display: "inline-block",
                  maxWidth: 1000,
                  width: "fit-content",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  position: "relative"
                }}
              >
                {/* Reply/quote block inside bubble */}
                {m.replyTo && (() => {
                  const quoted = messages.find(msg => msg.id === m.replyTo);
                  if (!quoted) return null;
                  const quotedName = userPrefs[quoted.uid]?.displayName || (quoted.uid === user.uid ? user.displayName : "") || "(No name)";
                  const quotedText = translations[quoted.id] !== undefined ? translations[quoted.id] : quoted.text;
                  return (
                    <div style={{
                      background: 'transparent',
                      borderLeft: '3px solid #bbb',
                      padding: '0.18rem 0.6rem',
                      marginBottom: 4,
                      fontSize: '0.85em',
                      color: '#555',
                      borderRadius: 0,
                      opacity: 1
                    }}>
                      <span style={{ fontWeight: 600, marginRight: 6 }}>{quotedName}:</span>
                      <span style={{ color: '#444' }}>{quotedText.length > 60 ? quotedText.slice(0, 60) + "…" : quotedText}</span>
                    </div>
                  );
                })()}

                {/* Render message text with clickable URLs and warning dialog */}
                {(() => {
                  const text = translations[m.id] !== undefined ? translations[m.id] : m.text;
                  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
                  const parts: (string | React.ReactElement)[] = [];
                  let lastIndex = 0;
                  let match;
                  let key = 0;
                  while ((match = urlRegex.exec(text)) !== null) {
                    const url = match[0];
                    const start = match.index;
                    if (start > lastIndex) {
                      parts.push(text.slice(lastIndex, start));
                    }
                    const href = url.startsWith('http') ? url : `https://${url}`;
                    parts.push(
                      <a
                        key={key++}
                        href={href}
                        style={{ color: '#0b5ed7', textDecoration: 'underline', wordBreak: 'break-all' }}
                        onClick={e => {
                          e.preventDefault();
                          setPendingLink({ url: href, label: url });
                        }}
                      >
                        {url}
                      </a>
                    );
                    lastIndex = start + url.length;
                  }
                  if (lastIndex < text.length) {
                    parts.push(text.slice(lastIndex));
                  }
                  return parts;
                })()}

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
                    opacity: hoveredUser === m.id ? 1 : 0.6,
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
                    style={{ cursor: "pointer", marginLeft: 6, fontSize: "0.9em", opacity: hoveredUser === m.id ? 1 : 0 }}
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
                    color: (m.likes ?? []).includes(user.uid) ? "#e0245e" : "#888",
                    opacity: 1,
                    pointerEvents: "auto",
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
                  {formatTime(m.createdAt, lang)}
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

      {/* Custom link confirmation modal */}
      {pendingLink && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: "2rem 2.5rem 1.5rem 2.5rem",
            boxShadow: "0 6px 32px rgba(0,0,0,0.22)",
            maxWidth: 370,
            minWidth: 260,
            textAlign: "center",
            fontSize: "1.05em"
          }}>
            <div style={{ fontWeight: 700, fontSize: "1.1em", marginBottom: 12, color: "#b50000" }}>
              外部リンクを開こうとしています
            </div>
            <div style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 6, padding: "0.5rem", marginBottom: 18, wordBreak: "break-all", color: "#222" }}>
              {pendingLink?.label}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem" }}>
              <button
                style={{ background: "#0b5ed7", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem 1.3rem", fontSize: "1em", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  if (pendingLink) window.open(pendingLink.url, '_blank', 'noopener');
                  setPendingLink(null);
                }}
              >OK</button>
              <button
                style={{ background: "#eee", color: "#444", border: "none", borderRadius: 6, padding: "0.5rem 1.3rem", fontSize: "1em", cursor: "pointer" }}
                onClick={() => setPendingLink(null)}
              >キャンセル</button>            </div>
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
        {userHasScrolledUp && (
          <button
            onClick={() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              setUserHasScrolledUp(false); // Reset the flag after clicking
            }}
            style={{
              position: "fixed",
              right: 24,
              bottom: 100,
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
             minHeight: '1.5em',
             height: '1.5em',
             maxHeight: 200,
             border: "1px solid #ccc",
             borderRadius: "20px",
             padding: "10px 10px",
             lineHeight: 1.5,
             fontSize: "1rem",
             outline: "none",
             overflow: "hidden",
             resize: "none"
           }}
           rows={1}
           placeholder="Message"
           value={text}
           onChange={e => setText(e.target.value)}
           onInput={e => {
             const el = e.currentTarget;
             // Only auto-resize if there is a line break (multi-line input)
             if (el.value.includes('\n')) {
               el.style.height = '1.5em';
               el.style.height = Math.min(el.scrollHeight, 200) + 'px';
             } else {
               el.style.height = '1.5em';
             }
           }}
           onKeyDown={e => {
             if (e.key === "Enter" && !e.shiftKey) {
               e.preventDefault();
               sendMessage();
             }
           }}
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
    </>
  );
}

export default ChatRoom;