import React from "react";

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
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }} onClick={onCancel}>
      <div 
        style={{
          background: "#fff",
          textAlign: "center",
          minWidth: 320,
          maxWidth: 400,
          padding: "2rem 1.5rem",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          border: "1px solid #e0e0e0",
          position: "relative",
          animation: "slideIn 0.2s ease-out",
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          width: "60px",
          height: "60px",
          margin: "0 auto 1rem",
          borderRadius: "50%",
          background: "#fee2e2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          color: "#dc2626"
        }}>
          ⚠️
        </div>
        
        {title && (
          <h3 style={{ 
            margin: "0 0 0.5rem 0",
            fontSize: "18px",
            fontWeight: 600,
            color: "#1f2937"
          }}>
            {title}
          </h3>
        )}
        
        <div style={{ 
          marginBottom: "2rem",
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: "1.5"
        }}>
          {message}
        </div>
        
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button 
            style={{ 
              background: "#dc3545",
              color: "#fff",
              padding: "0.75rem 1.5rem",
              fontWeight: 600,
              fontSize: 14,
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              minWidth: "90px"
            }} 
            onClick={onConfirm}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.3)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {confirmText}
          </button>
          <button 
            style={{ 
              background: "#f3f4f6", 
              color: "#374151",
              padding: "0.75rem 1.5rem",
              fontWeight: 600,
              fontSize: 14,
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              cursor: "pointer",
              transition: "all 0.2s",
              minWidth: "90px"
            }} 
            onClick={onCancel}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#f3f4f6";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {cancelText}
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default ConfirmModal;
