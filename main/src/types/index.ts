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
  role?: UserRole;
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

export type UserRole = 'admin' | 'staff' | 'user';

export type IdeaStatus = 'unconfirmed' | 'pending' | 'approved' | 'rejected';

export interface IdeaData {
  id: string;
  title: string;
  content: string;
  status: IdeaStatus;
  staffComment?: string;
  developmentPeriod?: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  roomId: string;
  originalLang?: string;
  translations?: Record<string, { title: string; content: string; staffComment?: string; }>;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface ProjectIdeaData {
  id: string;
  title: string;
  content: string;
  status: IdeaStatus;
  staffComment?: string;
  developmentPeriod?: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  projectId: string;
  originalLang?: string;
  translations?: Record<string, { title: string; content: string; staffComment?: string; }>;
}