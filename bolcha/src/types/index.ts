export interface UserPreferences {
  photoURL?: string;
  bubbleColor?: string;
  textColor?: string;
  backgroundColor?: string;
  displayName?: string;
  nickname?: string;
  email?: string;
  side?: 'left' | 'right';
  showOriginal?: boolean;
  lang?: string;
  enterToSend?: boolean;
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
  text: string;
  uid: string;
  createdAt: Date;
  readBy?: string[];
  likes?: string[];
  replyTo?: string;
  originalLang?: string; // ISO-639-1 code of source language
  translations?: Record<string, string>; // cached translations per language
}