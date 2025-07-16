import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "firebase/auth";

export default function useIsAdmin(user: User | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    // 管理者権限チェック用の専用ドキュメントを参照
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
      const userData = snap.data();
      setIsAdmin(userData?.role === 'admin');
      },
      (err) => {
        if (err.code === 'permission-denied') {
        } else {
        }
      }
    );
    return unsub;
  }, [user]);

  return isAdmin;
}
