import React from 'react';
import { iconButtonStyle } from '../styles/buttonStyles';

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export default function IconButton({ onClick, children, title, style, disabled = false }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ ...iconButtonStyle, ...style }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}