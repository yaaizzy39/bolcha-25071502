import React from "react";
import { modalOverlayStyle, modalContentStyle } from '../styles/modalStyles';
import { dangerButtonStyle, secondaryButtonStyle } from '../styles/buttonStyles';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  open, 
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "削除する",
  cancelText = "キャンセル"
}) => {
  if (!open) return null;
  return (
    <div style={modalOverlayStyle}>
      <div style={{
        ...modalContentStyle,
        textAlign: "center",
        minWidth: 280,
      }}>
        {title && <h3 style={{ margin: "0 0 1rem 0" }}>{title}</h3>}
        <div style={{ marginBottom: "1.5rem" }}>{message}</div>
        <button 
          style={{ 
            ...dangerButtonStyle, 
            margin: "0 0.5rem",
            fontWeight: 600,
            fontSize: 16,
          }} 
          onClick={onConfirm}
        >
          {confirmText}
        </button>
        <button 
          style={{ 
            ...secondaryButtonStyle, 
            background: "#ddd", 
            color: "#333",
            margin: "0 0.5rem",
            fontWeight: 600,
            fontSize: 16,
          }} 
          onClick={onCancel}
        >
          {cancelText}
        </button>
      </div>
    </div>
  );
};

export default ConfirmModal;
