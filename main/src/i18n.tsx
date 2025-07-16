import { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export type UILang = "en" | "ja";

const translations: Record<UILang, Record<string, string>> = {
  en: {
    profileSettings: "Profile Settings",
    avatar: "Avatar:",
    nickname: "Nickname:",
    nicknameLimit: "Up to 8 full-width characters (16 half-width characters)",
    googleAccount: "Google Account:",
    role: "Role:",
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
    // App.tsx logout modal
    logoutConfirmTitle: "Are you sure you want to logout?",
    logoutConfirmMessage: "This will end your current session and return you to the login screen.",
    logout: "Logout",
    // Profile.tsx additional strings
    nicknameRequired: "📝 Please set your nickname. This is the name that will be displayed to other users in chat.",
    nicknamePlaceholder: "Enter a name to display in chat",
    understood: "Understood",
    nicknameNotSet: "Nickname Not Set",
    nicknameNotSetMessage: "Please enter a nickname that will be displayed\nto other users in chat",
    // Home.tsx
    homeTitle: "Bolcha - Home",
    homeSubtitle: "Which feature would you like to use?",
    chatRooms: "Chat Rooms",
    chatRoomsDesc: "Real-time communication through chat",
    ideaManagement: "Idea Management",
    ideaManagementDesc: "Post, manage, and evaluate ideas",
    loggedInAs: "Logged in as: ",
    // Rooms.tsx
    backToHome: "Back to Home",
    roomAlreadyExists: "A room with the same name already exists",
    roomNameTooLong: "Room name must be up to 18 full-width or 36 half-width characters.",
    roomLimitReached: "Room limit has been reached",
    confirmRoomDeletion: "Confirm Room Deletion",
    roomCount: "Room count",
    roomCountWithLimit: "rooms",
    unlimited: "unlimited",
    limitReached: "(limit reached)",
    newRoomPlaceholder: "New room name",
    max: "Max",
    roomAutoDeleteInfo: "This room will be automatically deleted {hours} hours after the last post.",
    confirmDeleteRoom: "Are you sure you want to delete this room \"{roomName}\"? This action cannot be undone.",
    confirmDeleteRoomGeneric: "Are you sure you want to delete this room? This action cannot be undone.",
    deleteIdeaTitle: "Delete Idea",
    deleteIdeaMessage: "Are you sure you want to delete this idea? This action cannot be undone.",
    deleteButton: "Delete",
    cancelButton: "Cancel",
    // ChatRoom.tsx
    deletedUser: "[Deleted User]",
    // Common UI
    loading: "Loading...",
    edit: "Edit",
    delete: "Delete",
    update: "Update",
    post: "Post",
    title: "Title",
    content: "Content",
    description: "Description",
    unknown: "Unknown",
    createdAt: "Created:",
    postedAt: "Posted:",
    // Ideas (section for idea management pages)
    ideaMgmt: "Idea Management",
    newIdea: "Post New Idea",
    editIdea: "Edit Idea",
    ideaContent: "Idea Content",
    noIdeas: "No ideas yet",
    postFirstIdea: "Let's post your first idea",
    deleteIdeaConfirm: "Are you sure you want to delete this idea?",
    // Projects
    projectManagement: "Project Management",
    newProject: "Create New Project",
    editProject: "Edit Project",
    projectName: "Project Name",
    project: "Project",
    manageIdeas: "💡 Manage Ideas",
    noProjects: "No projects found",
    createFirstProject: "Create a new project to get started",
    deleteProjectConfirm: "Are you sure you want to delete this project? All related ideas will also be deleted.",
    backToProjects: "← Back to Projects",
    // Status
    unconfirmed: "Unconfirmed",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    create: "Create",
    adminJudgment: "Manager Decision:",
    adminOperations: "Manager Operations:",
    adminComment: "Manager Comment:",
    adminCommentPlaceholder: "Manager Comment",
    developmentPeriod: "Development Period:",
    developmentPeriodPlaceholder: "Development Period",
    // Errors
    saveIdeaError: "An error occurred while saving the idea",
    saveProjectError: "An error occurred while saving the project",
    permissionDeniedIdea: "Permission error: You don't have permission to create ideas. Please contact an administrator.",
    permissionDeniedProject: "Permission error: You don't have permission to create projects. Please contact an administrator.",
  },
  ja: {
    profileSettings: "プロフィール設定",
    avatar: "アバター：",
    nickname: "ニックネーム：",
    nicknameLimit: "全角8文字（半角16文字）まで",
    googleAccount: "Googleアカウント：",
    role: "ロール：",
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
    // App.tsx logout modal
    logoutConfirmTitle: "ログアウトしますか？",
    logoutConfirmMessage: "現在のセッションを終了してログイン画面に戻ります。",
    logout: "ログアウト",
    // Profile.tsx additional strings
    nicknameRequired: "📝 ニックネームを設定してください。チャットで他のユーザーに表示される名前です。",
    nicknamePlaceholder: "チャットで表示される名前を入力",
    understood: "わかりました",
    nicknameNotSet: "ニックネーム未設定",
    nicknameNotSetMessage: "チャットで他のユーザーに表示される\nニックネームを入力してください",
    // Home.tsx
    homeTitle: "Bolcha - ホーム",
    homeSubtitle: "どちらの機能を使用しますか？",
    chatRooms: "チャットルーム",
    chatRoomsDesc: "リアルタイムチャットでコミュニケーション",
    ideaManagement: "アイデア管理",
    ideaManagementDesc: "アイデアの投稿・管理・評価",
    loggedInAs: "ログイン中: ",
    // Rooms.tsx
    backToHome: "ホームに戻る",
    roomAlreadyExists: "同じ名前のルームが既に存在します",
    roomNameTooLong: "ルーム名は全角18文字または半角36文字までです。",
    roomLimitReached: "ルーム数が上限に達しています",
    confirmRoomDeletion: "ルーム削除の確認",
    roomCount: "ルーム数",
    roomCountWithLimit: "個",
    unlimited: "制限なし",
    limitReached: "(上限に達しています)",
    newRoomPlaceholder: "新しいルーム名",
    max: "最大",
    roomAutoDeleteInfo: "このルームは最終投稿から{hours}時間後に自動で削除されます。",
    confirmDeleteRoom: "本当にこのルーム「{roomName}」を削除しますか？この操作は取り消せません。",
    confirmDeleteRoomGeneric: "本当にこのルームを削除しますか？この操作は取り消せません。",
    deleteIdeaTitle: "アイデアを削除",
    deleteIdeaMessage: "本当にこのアイデアを削除しますか？この操作は取り消せません。",
    deleteButton: "削除する",
    cancelButton: "キャンセル",
    // ChatRoom.tsx
    deletedUser: "[削除されたユーザー]",
    // Common UI
    loading: "読み込み中...",
    edit: "編集",
    delete: "削除",
    update: "更新",
    post: "投稿",
    title: "タイトル",
    content: "内容",
    description: "説明",
    unknown: "不明",
    createdAt: "作成日:",
    postedAt: "投稿日:",
    // Ideas (section for idea management pages)
    ideaMgmt: "アイデア管理",
    newIdea: "新しいアイデアを投稿",
    editIdea: "アイデアを編集",
    ideaContent: "アイデアの内容",
    noIdeas: "まだアイデアがありません",
    postFirstIdea: "最初のアイデアを投稿しましょう",
    deleteIdeaConfirm: "このアイデアを削除しますか？",
    // Projects
    projectManagement: "プロジェクト管理",
    newProject: "新しいプロジェクトを作成",
    editProject: "プロジェクトを編集",
    projectName: "プロジェクト名",
    project: "プロジェクト",
    manageIdeas: "💡 アイデアを管理",
    noProjects: "プロジェクトがありません",
    createFirstProject: "新しいプロジェクトを作成して始めましょう",
    deleteProjectConfirm: "このプロジェクトを削除しますか？関連するアイデアもすべて削除されます。",
    backToProjects: "← プロジェクト一覧に戻る",
    // Status
    unconfirmed: "未確認",
    pending: "検討中",
    approved: "採用",
    rejected: "却下",
    create: "作成",
    adminJudgment: "運営の判断:",
    adminOperations: "運営操作:",
    adminComment: "運営コメント:",
    adminCommentPlaceholder: "運営コメント",
    developmentPeriod: "開発期間:",
    developmentPeriodPlaceholder: "開発期間",
    // Errors
    saveIdeaError: "アイデアの保存中にエラーが発生しました",
    saveProjectError: "プロジェクトの保存中にエラーが発生しました",
    permissionDeniedIdea: "権限エラー: アイデアの作成権限がありません。管理者に連絡してください。",
    permissionDeniedProject: "権限エラー: プロジェクトの作成権限がありません。管理者に連絡してください。",
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

  // Sync with Firestore when user authenticates
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const firestoreLang = userData.uiLang;
            if (firestoreLang === "ja" || firestoreLang === "en") {
              // Only update if different from current state to avoid unnecessary re-renders
              if (firestoreLang !== lang) {
                setLangState(firestoreLang);
                localStorage.setItem("ui_lang", firestoreLang);
              }
            }
          }
        } catch (error) {
          console.error("Error loading language preference from Firestore:", error);
        }
      }
    });

    return unsubscribe;
  }, [lang]);

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
