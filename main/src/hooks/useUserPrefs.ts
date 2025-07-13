import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserPreferences } from '../types';

export const useUserPrefs = (uid: string) => {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem("chat_prefs");
      return saved ? JSON.parse(saved) : { 
        side: "right", 
        showOriginal: true, 
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone 
      };
    } catch {
      return { 
        side: "right", 
        showOriginal: true, 
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone 
      };
    }
  });

  const [lang, setLang] = useState<string>(() => {
    try {
      return localStorage.getItem("chat_lang") || "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const data = snap.data() as UserPreferences;
          setPrefs((p) => {
            const merged = { ...p, ...data };
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
  }, [uid]);

  return { prefs, setPrefs, lang, setLang };
};