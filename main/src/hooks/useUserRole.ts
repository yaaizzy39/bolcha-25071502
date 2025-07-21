import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "firebase/auth";
import type { UserRole } from "../types";

export default function useUserRole(user: User | null): UserRole {
  const [role, setRole] = useState<UserRole>('user');

  useEffect(() => {
    if (!user) {
      setRole('user');
      return;
    }
    
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const userData = snap.data();
        setRole(userData?.role || 'user');
      },
      (err) => {
        console.error("Error fetching user role:", err);
        if (err.code === 'permission-denied') {
          setRole('user');
        } else {
          setRole('user');
        }
      }
    );
    return unsub;
  }, [user]);

  return role;
}