import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// utils --------------------------------------------------
// function hexToRgb(hex: string): [number, number, number] {
//   const m = hex.replace("#", "").match(/.{1,2}/g);
//   if (!m) return [255, 255, 255];
//   return m.map((x) => parseInt(x, 16)) as [number, number, number];
// }
// function rgbToHex(r: number, g: number, b: number) {
//   return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
// }
// function luminance(hex: string): number {
//   const [r, g, b] = hexToRgb(hex);
//   return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
// }
import { db, storage } from "../firebase";
import type { User } from "firebase/auth";
import type { UserPreferences } from "../types";

interface Props {
  user: User;
  needsNickname?: boolean;
  onSaved?: () => void;
}

const defaultPrefs: UserPreferences = {
  side: "right",
  showOriginal: true,
  bubbleColor: "#ffffff",
  textColor: "#000000",
  backgroundColor: "#f5f5f5",
  enterToSend: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// Common timezones for the dropdown
const commonTimezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland'
];

export default function Profile({ user, needsNickname, onSaved }: Props) {
  const navigate = useNavigate();
  const { lang: uiLang, setLang: setUiLang, t } = useI18n();
  const [prefs, setPrefs] = useState<UserPreferences>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [showNicknameWarning, setShowNicknameWarning] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // プライベート設定を読み込み
        const privateSnap = await getDoc(doc(db, "users", user.uid));
        let privateData = {};
        if (privateSnap.exists()) {
          privateData = privateSnap.data();
        }
        
        // パブリック設定を読み込み（ニックネーム、色設定）
        const publicSnap = await getDoc(doc(db, "userProfiles", user.uid));
        let publicData = {};
        if (publicSnap.exists()) {
          publicData = publicSnap.data();
        }
        
        // 両方をマージして設定
        setPrefs({ ...defaultPrefs, ...privateData, ...publicData } as UserPreferences);
      } catch (error) {
        console.error("Error loading user preferences:", error);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    // ニックネームが空の場合は警告
    if (!prefs.nickname?.trim()) {
      setShowNicknameWarning(true);
      return;
    }
    
    setSaving(true);
    let newPhotoURL = prefs.photoURL || user.photoURL;

    if (selectedImageFile) {
      const ext = selectedImageFile.name.split(".").pop() || "jpg";
      const path = `avatars/${user.uid}/${user.uid}_${Date.now()}.${ext}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, selectedImageFile);
      newPhotoURL = await getDownloadURL(fileRef);

      // update firebase auth profile so header reflects change
      if (user.photoURL !== newPhotoURL) {
        const module = await import("firebase/auth");
        const { updateProfile } = module;
        await updateProfile(user, { photoURL: newPhotoURL });
      }
    }

    const updatedPrefs = { ...prefs, photoURL: newPhotoURL };
    
    // プライベート情報（個人設定のみ）
    const privateData: any = {
      updatedAt: new Date()
    };
    
    // undefined値を除外して追加
    if (updatedPrefs.displayName || user.displayName) {
      privateData.displayName = updatedPrefs.displayName || user.displayName;
    }
    // メールアドレスは初回登録時のみ保存し、プロファイル更新時は送信しない
    if (updatedPrefs.lang) {
      privateData.lang = updatedPrefs.lang;
    }
    if (updatedPrefs.side) {
      privateData.side = updatedPrefs.side;
    }
    if (updatedPrefs.timezone) {
      privateData.timezone = updatedPrefs.timezone;
    }
    
    await setDoc(doc(db, "users", user.uid), privateData, { merge: true });
    
    // パブリック情報（チャット表示用）
    const publicProfile: any = {
      updatedAt: new Date()
    };
    
    // undefined値を除外して追加
    if (updatedPrefs.nickname?.trim()) {
      publicProfile.nickname = updatedPrefs.nickname.trim();
    }
    if (newPhotoURL) {
      publicProfile.photoURL = newPhotoURL;
    }
    if (updatedPrefs.bubbleColor) {
      publicProfile.bubbleColor = updatedPrefs.bubbleColor;
    }
    if (updatedPrefs.textColor) {
      publicProfile.textColor = updatedPrefs.textColor;
    }
    
    await setDoc(doc(db, "userProfiles", user.uid), publicProfile, { merge: true });
    
    // Update localStorage to immediately reflect changes in ChatRoom
    localStorage.setItem("chat_prefs", JSON.stringify(updatedPrefs));
    
    // Trigger a custom event to notify ChatRoom of the update
    window.dispatchEvent(new CustomEvent('userPrefsUpdated', { 
      detail: { uid: user.uid, prefs: updatedPrefs } 
    }));
    
    setSelectedImageFile(null); // Clear selected file after saving
    setSaving(false);
    onSaved?.();
    
    // 初回ログイン時（needsNicknameがtrueの場合）はホーム画面にリダイレクト
    // それ以外の場合は前のページに戻る
    if (needsNickname) {
      // 初回ログイン時（ニックネーム設定が必要な場合）
      navigate('/');
    } else {
      // 通常のプロフィール編集時
      navigate(-1);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      setPrefs((p) => ({ ...p, photoURL: URL.createObjectURL(file) })); // For immediate preview
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <h3>{t("profileSettings")}</h3>
      <div style={{ marginBottom: "1rem" }}>
        <label>{t("avatar")}</label>
        <br />
        <img 
          src={prefs.photoURL || user.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='40' fill='%23ddd'/%3E%3Ccircle cx='40' cy='32' r='15' fill='%23bbb'/%3E%3Cellipse cx='40' cy='60' rx='22' ry='15' fill='%23bbb'/%3E%3C/svg%3E"} 
          alt="avatar" 
          width={80} 
          height={80} 
          style={{ borderRadius: "50%", background: '#eee' }}
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='40' fill='%23ddd'/%3E%3Ccircle cx='40' cy='32' r='15' fill='%23bbb'/%3E%3Cellipse cx='40' cy='60' rx='22' ry='15' fill='%23bbb'/%3E%3C/svg%3E";
          }}
        />
        <br />
        <input type="file" accept="image/*" onChange={handleFile} />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{t("googleAccount")}</label>
        <br />
        <div style={{ 
          padding: "0.5rem", 
          marginTop: "0.25rem", 
          borderRadius: "8px", 
          border: "1px solid #ddd", 
          backgroundColor: "#f8f9fa",
          fontSize: "0.9rem",
          color: "#666"
        }}>
          {user.email || "No email"}
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{t("nickname")}</label>
        {!prefs.nickname?.trim() && (
          <div style={{ 
            background: "#fff3cd", 
            border: "1px solid #ffeaa7", 
            borderRadius: "4px", 
            padding: "8px", 
            margin: "4px 0",
            fontSize: "0.9em",
            color: "#856404"
          }}>
            {t("nicknameRequired")}
          </div>
        )}
        <br />
        <input
          type="text"
          value={prefs.nickname ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= 16) {
              setPrefs((p) => ({ ...p, nickname: value }));
            }
          }}
          placeholder={t("nicknamePlaceholder")}
          maxLength={16}
          style={{ 
            width: "100%", 
            padding: "0.5rem", 
            marginTop: "0.25rem", 
            borderRadius: "8px", 
            border: !prefs.nickname?.trim() ? "2px solid #ffeaa7" : "1px solid #ddd"
          }}
        />
        <small style={{ color: "#666" }}>
          {t("nicknameLimit")}
        </small>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{t("uiLanguage")}</label>
        <br />
        <select
          value={uiLang}
          onChange={async (e) => {
            const val = e.target.value as "en" | "ja";
            setUiLang(val);
            await setDoc(doc(db, "users", user.uid), { uiLang: val }, { merge: true });
          }}
          style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid #ddd" }}
        >
          <option value="en">{t("english")}</option>
          <option value="ja">{t("japanese")}</option>
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{uiLang === 'ja' ? 'タイムゾーン' : 'Timezone'}</label>
        <br />
        <select
          value={prefs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
          style={{ padding: "0.5rem", borderRadius: "8px", border: "1px solid #ddd", width: "100%" }}
        >
          {commonTimezones.map(tz => (
            <option key={tz} value={tz}>
              {tz} ({new Intl.DateTimeFormat(uiLang === 'ja' ? 'ja-JP' : 'en-US', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }).format(new Date())})
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{t("bubbleColor") ?? "Bubble Color"}</label>
        <br />
        <input
          type="color"
          value={prefs.bubbleColor ?? "#ffffff"}
          onChange={(e) => setPrefs((p) => ({ ...p, bubbleColor: e.target.value }))}
          style={{ width: 50, height: 34, border: "none", background: "none", padding: 0 }}
        />
        <input
          type="text"
          value={prefs.bubbleColor ?? "#ffffff"}
          onChange={(e) => setPrefs((p) => ({ ...p, bubbleColor: e.target.value }))}
          pattern="#?[0-9a-fA-F]{6}"
          style={{ marginLeft: 8, width: 90, borderRadius: "6px", border: "1px solid #ddd", padding: "0.25rem" }}
        />
      </div>

      {/* text color picker */}
      <div style={{ marginBottom: "1rem" }}>
        <label>{t("textColor") ?? "Text Color"}</label>
        <br />
        <input
          type="color"
          value={prefs.textColor ?? "#000000"}
          onChange={(e) => setPrefs((p) => ({ ...p, textColor: e.target.value }))}
          style={{ width: 50, height: 34, border: "none", background: "none", padding: 0 }}
        />
        <input
          type="text"
          value={prefs.textColor ?? "#000000"}
          onChange={(e) => setPrefs((p) => ({ ...p, textColor: e.target.value }))}
          pattern="#?[0-9a-fA-F]{6}"
          style={{ marginLeft: 8, width: 90, borderRadius: "6px", border: "1px solid #ddd", padding: "0.25rem" }}
        />
      </div>

      {/* background color picker */}
      <div style={{ marginBottom: "1rem" }}>
        <label>{t("backgroundColor") ?? "Background Color"}</label>
        <br />
        <input
          type="color"
          value={prefs.backgroundColor ?? "#f5f5f5"}
          onChange={(e) => setPrefs((p) => ({ ...p, backgroundColor: e.target.value }))}
          style={{ width: 50, height: 34, border: "none", background: "none", padding: 0 }}
        />
        <input
          type="text"
          value={prefs.backgroundColor ?? "#f5f5f5"}
          onChange={(e) => setPrefs((p) => ({ ...p, backgroundColor: e.target.value }))}
          pattern="#?[0-9a-fA-F]{6}"
          style={{ marginLeft: 8, width: 90, borderRadius: "6px", border: "1px solid #ddd", padding: "0.25rem" }}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>{t("myMessagePos")}</label>
        <br />
        <label>
          <input
            type="radio"
            value="left"
            checked={prefs.side === "left"}
            onChange={() => setPrefs((p) => ({ ...p, side: "left" }))}
          />
          {t("left")}
        </label>
        <label style={{ marginLeft: "1rem" }}>
          <input
            type="radio"
            value="right"
            checked={prefs.side === "right"}
            onChange={() => setPrefs((p) => ({ ...p, side: "right" }))}
          />
          {t("right")}
        </label>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>
          <input
            type="checkbox"
            checked={prefs.showOriginal}
            onChange={() => setPrefs((p) => ({ ...p, showOriginal: !p.showOriginal }))}
          />
          {t("showOriginal")}
        </label>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>
          <input
            type="checkbox"
            checked={prefs.enterToSend ?? false}
            onChange={() => setPrefs((p) => ({ ...p, enterToSend: !p.enterToSend }))}
          />
          {t("enterToSend")}
        </label>
        <br />
        <small style={{ color: "#666", marginTop: "0.25rem", display: "block" }}>
          {t("enterToSendDesc")}
        </small>
      </div>

      <div style={{ display: 'flex', gap: '1em', justifyContent: 'flex-start' }}>
        <button className="profile-btn" onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </button>
        <button
          className="profile-btn"
          type="button"
          onClick={() => navigate(-1)}
        >
          {t("cancel")}
        </button>
      </div>

      {/* ニックネーム警告モーダル */}
      {showNicknameWarning && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "2rem",
            maxWidth: "400px",
            width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            <div style={{
              fontSize: "2rem",
              marginBottom: "1rem"
            }}>
              ✏️
            </div>
            <h3 style={{
              color: "#d63384",
              margin: "0 0 1rem 0",
              fontSize: "1.2rem"
            }}>
              {t("nicknameNotSet")}
            </h3>
            <p style={{
              color: "#666",
              lineHeight: "1.5",
              margin: "0 0 2rem 0"
            }}>
              {t("nicknameNotSetMessage").split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br/>}
                </span>
              ))}
            </p>
            <button
              onClick={() => setShowNicknameWarning(false)}
              style={{
                background: "#0066cc",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "0.75rem 2rem",
                fontSize: "1rem",
                cursor: "pointer",
                fontWeight: "500"
              }}
            >
              {t("understood")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}