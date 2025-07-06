import { createContext, useContext, useState } from "react";

export type UILang = "en" | "ja";

const translations: Record<UILang, Record<string, string>> = {
  en: {
    profileSettings: "Profile Settings",
    avatar: "Avatar:",
    nickname: "Nickname:",
    nicknameLimit: "Up to 8 full-width characters (16 half-width characters)",
    googleAccount: "Google Account:",
    enterToSend: "Press Enter to send message",
    enterToSendDesc: "When enabled: Enter to send, Shift+Enter for new line",
    myMessagePos: "My message position:",
    right: "Right",
    left: "Left",
    showOriginal: "Show original text below translation",
    save: "Save",
    saving: "Saving...",
    uiLanguage: "UI language:",
    english: "English",
    bubbleColor: "Bubble color",
    textColor: "Text color",
    backgroundColor: "Background color",
    japanese: "日本語",
    externalLinkWarning: "Opening External Link!\nPlease be careful of fraudulent or malicious websites!",
    cancel: "Cancel",
    ok: "OK",
  },
  ja: {
    profileSettings: "プロフィール設定",
    avatar: "アバター：",
    nickname: "ニックネーム：",
    nicknameLimit: "全角8文字（半角16文字）まで",
    googleAccount: "Googleアカウント：",
    enterToSend: "Enterキーでメッセージ送信",
    enterToSendDesc: "有効時：Enterで送信、Shift+Enterで改行",
    myMessagePos: "自分のメッセージ位置：",
    right: "右",
    left: "左",
    showOriginal: "翻訳の下に原文を表示",
    save: "保存",
    saving: "保存中...",
    uiLanguage: "表示言語：",
    english: "英語",
    bubbleColor: "吹き出し色",
    textColor: "文字色",
    backgroundColor: "背景色",
    japanese: "日本語",
    externalLinkWarning: "外部リンクを開こうとしています！\n詐欺や悪意のあるサイトには十分注意してください！",
    cancel: "キャンセル",
    ok: "OK",
  },
};

interface I18nContextValue {
  lang: UILang;
  setLang: (lang: UILang) => void;
  t: (key: keyof typeof translations["en"]) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (k) => translations.en[k],
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UILang>(() => {
    const stored = localStorage.getItem("ui_lang");
    if (stored === "ja" || stored === "en") return stored;
    return "en";
  });

  const setLang = (l: UILang) => {
    setLangState(l);
    localStorage.setItem("ui_lang", l);
  };

  const t = (key: keyof typeof translations["en"]) => translations[lang][key] || key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
