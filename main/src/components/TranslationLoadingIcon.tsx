import React from 'react';

interface TranslationLoadingIconProps {
  size?: number;
  className?: string;
}

export default function TranslationLoadingIcon({ size = 16, className = '' }: TranslationLoadingIconProps) {
  const pulseAnimation = {
    animation: 'pulse 1.5s ease-in-out infinite',
    '@keyframes pulse': {
      '0%, 100%': { opacity: 0.5, transform: 'scale(1)' },
      '50%': { opacity: 1, transform: 'scale(1.1)' }
    }
  };

  return (
    <span 
      className={`translation-loading ${className}`}
      style={{ 
        display: 'inline-block',
        marginLeft: '4px',
        verticalAlign: 'middle',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}
    >
      {/* シンプルな思考泡 */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#666"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* メインの吹き出し */}
        <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        
        {/* 3つの点 */}
        <circle cx="8" cy="12" r="1" fill="#666" />
        <circle cx="12" cy="12" r="1" fill="#666" />
        <circle cx="16" cy="12" r="1" fill="#666" />
        
        {/* 小さい思考泡 */}
        <circle cx="6" cy="18" r="1" fill="#666" opacity="0.7" />
        <circle cx="4" cy="20" r="0.5" fill="#666" opacity="0.5" />
      </svg>
      
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          .translation-loading {
            animation: pulse 1.5s ease-in-out infinite;
          }
        `
      }} />
    </span>
  );
}