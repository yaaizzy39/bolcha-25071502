import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

function Login() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // プライベート情報（個人設定のみ）
      const privateData: any = {
        uid: user.uid,
        updatedAt: serverTimestamp(),
      };
      
      // undefined値を除外して追加
      if (user.displayName) {
        privateData.displayName = user.displayName;
      }
      if (user.email) {
        privateData.email = user.email;
      }
      
      await setDoc(doc(db, "users", user.uid), privateData, { merge: true });
      
      // パブリック情報（チャット表示用のみ）
      const publicData: any = {
        updatedAt: serverTimestamp(),
      };
      
      // undefined値を除外して追加
      if (user.photoURL) {
        publicData.photoURL = user.photoURL;
      }
      
      await setDoc(doc(db, "userProfiles", user.uid), publicData, { merge: true });
    } catch (err) {
      alert("Google sign-in failed");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column" }}>
      <h1>Bolcha</h1>
      <button onClick={handleLogin} style={{ padding: "0.6rem 1.2rem", fontSize: "1rem" }}>
        Sign in with Google
      </button>
    </div>
  );
}

export default Login;
