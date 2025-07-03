export interface UserPreferences {
  photoURL?: string;
  bubbleColor?: string;
  textColor?: string;
  displayName?: string;
  side?: 'left' | 'right';
  showOriginal?: boolean;
  lang?: string;
}

export interface FirestoreTimestamp {
  toDate(): Date;
}

export interface RoomData {
  name: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  lastActivityAt: FirestoreTimestamp;
}

export interface Message {
  id: string;
  uid: string;
  text: string;
  createdAt: FirestoreTimestamp;
  likes?: { [uid: string]: boolean };
  translatedText?: string;
  originalText?: string;
  isTranslated?: boolean;
}