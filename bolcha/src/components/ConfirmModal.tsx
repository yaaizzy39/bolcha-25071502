import React from "react";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const modalStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: "2rem 2.5rem 1.5rem 2.5rem",
  minWidth: 280,
  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
  textAlign: "center",
};

const buttonStyle: React.CSSProperties = {
  margin: "0 0.5rem",
  padding: "0.5rem 1.5rem",
  borderRadius: 6,
  border: "none",
  fontWeight: 600,
  fontSize: 16,
  cursor: "pointer",
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({ open, title, message, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div style={modalStyle}>
      <div style={dialogStyle}>
        {title && <h3 style={{ margin: "0 0 1rem 0" }}>{title}</h3>}
        <div style={{ marginBottom: "1.5rem" }}>{message}</div>
        <button style={{ ...buttonStyle, background: "#e53e3e", color: "#fff" }} onClick={onConfirm}>
          削除する
        </button>
        <button style={{ ...buttonStyle, background: "#ddd", color: "#333" }} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
};

export default ConfirmModal;
