import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';

interface MessageInputProps {
  user: User;
  roomId: string;
  onMessageSent?: () => void;
}

export default function MessageInput({ user, roomId, onMessageSent }: MessageInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        text: message.trim(),
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      setMessage("");
      onMessageSent?.();
    } catch (error) {
    }
  };

  return (
    <div style={{
      position: "sticky",
      bottom: 0,
      background: "#fff",
      borderTop: "1px solid #eee",
    }}>
      <form onSubmit={handleSubmit} style={{ 
        padding: "1rem", 
        maxWidth: 1000, 
        margin: "0 auto"
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: "0.75rem",
            border: "1px solid #ddd",
            borderRadius: "20px",
            outline: "none",
            fontSize: "16px",
          }}
        />
        <button
          type="submit"
          disabled={!message.trim()}
          style={{
            padding: "0.75rem 1.5rem",
            background: message.trim() ? "#007bff" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: "20px",
            cursor: message.trim() ? "pointer" : "not-allowed",
            fontSize: "16px",
          }}
        >
          Send
        </button>
        </div>
      </form>
    </div>
  );
}