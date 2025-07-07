import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

function Login() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // プライベート情報（個人設定のみ）
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      
      // パブリック情報（チャット表示用のみ）
      await setDoc(
        doc(db, "userProfiles", user.uid),
        {
          photoURL: user.photoURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
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
