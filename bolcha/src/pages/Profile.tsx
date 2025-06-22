import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import type { User } from "firebase/auth";

interface Props {
  user: User;
  onSaved?: () => void;
}

type Prefs = {
  side: "left" | "right";
  showOriginal: boolean;
  lang: string;
  photoURL?: string;
};

const defaultPrefs: Prefs = {
  side: "right",
  showOriginal: true,
  lang: (localStorage.getItem("chat_lang") || navigator.language.slice(0,2) || "en"),
};

export default function Profile({ user, onSaved }: Props) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setPrefs({ ...defaultPrefs, ...snap.data() } as Prefs);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, "users", user.uid), prefs, { merge: true });
    setSaving(false);
    onSaved?.();
    navigate(-1);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop() || "jpg";
    // Save into per-user subfolder so rules match avatars/{userId}/**
  const path = `avatars/${user.uid}/${user.uid}_${Date.now()}.${ext}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    setPrefs((p) => ({ ...p, photoURL: url }));
    await setDoc(doc(db, "users", user.uid), { photoURL: url }, { merge: true });
    // update firebase auth profile so header reflects change
    if (user.photoURL !== url) {
      const { updateProfile } = await import("firebase/auth");
      await updateProfile(user, { photoURL: url });
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <h3>Profile Settings</h3>
      <div style={{ marginBottom: "1rem" }}>
        <label>Avatar:</label>
        <br />
        {prefs.photoURL ? (
          <img src={prefs.photoURL} alt="avatar" width={80} height={80} style={{ borderRadius: "50%" }} />
        ) : (
          <img src={user.photoURL ?? undefined} alt="avatar" width={80} height={80} style={{ borderRadius: "50%" }} />
        )}
        <br />
        <input type="file" accept="image/*" onChange={handleFile} />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Preferred language:</label>
        <br />
        <select
          value={prefs.lang}
          onChange={(e) => setPrefs((p) => ({ ...p, lang: e.target.value }))}
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ne">नेपाली</option>
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>My message position:</label>
        <br />
        <label>
          <input
            type="radio"
            value="right"
            checked={prefs.side === "right"}
            onChange={() => setPrefs((p) => ({ ...p, side: "right" }))}
          />
          Right
        </label>
        <label style={{ marginLeft: "1rem" }}>
          <input
            type="radio"
            value="left"
            checked={prefs.side === "left"}
            onChange={() => setPrefs((p) => ({ ...p, side: "left" }))}
          />
          Left
        </label>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>
          <input
            type="checkbox"
            checked={prefs.showOriginal}
            onChange={() => setPrefs((p) => ({ ...p, showOriginal: !p.showOriginal }))}
          />
          Show original text below translation
        </label>
      </div>

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
