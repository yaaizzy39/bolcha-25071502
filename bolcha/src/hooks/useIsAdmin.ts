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
    const ref = doc(db, "admin", "config");
    const unsub = onSnapshot(
      ref,
      (snap) => {
      const emails: string[] = snap.data()?.adminEmails ?? [];
      setIsAdmin(emails.includes(user.email ?? ""));
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
