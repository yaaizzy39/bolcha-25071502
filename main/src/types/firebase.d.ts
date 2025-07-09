// Firebase型定義の補完
declare module 'firebase/firestore' {
  export const getFirestore: any;
  export const doc: any;
  export const collection: any;
  export const addDoc: any;
  export const getDocs: any;
  export const getDoc: any;
  export const setDoc: any;
  export const updateDoc: any;
  export const deleteDoc: any;
  export const query: any;
  export const orderBy: any;
  export const onSnapshot: any;
  export const serverTimestamp: any;
  export const arrayUnion: any;
  export const arrayRemove: any;
}

declare module 'firebase/auth' {
  export const getAuth: any;
  export const signInWithPopup: any;
  export const GoogleAuthProvider: any;
  export const onAuthStateChanged: any;
  export const signOut: any;
  export const updateProfile: any;
  export type User = any;
}

declare module 'firebase/storage' {
  export const getStorage: any;
  export const ref: any;
  export const uploadBytes: any;
  export const getDownloadURL: any;
}

declare module 'firebase/functions' {
  export const getFunctions: any;
  export const httpsCallable: any;
}