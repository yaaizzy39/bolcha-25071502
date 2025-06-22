// src/langDetect.ts

export function detectLanguageSync(text: string): string {
  const t = (text || '').trim();
  if (!t) return 'en';
  if (/^[\u0000-\u007f]+$/.test(t)) return 'en';         // ASCII
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(t)) return 'ja'; // Hiragana/Katakana
  if (/[\uac00-\ud7af]/.test(t))       return 'ko';        // Hangul
  if (/[\u4e00-\u9fff]/.test(t))       return 'zh';        // CJK Ideographs
  return 'en';
}

export async function detectLanguage(text: string): Promise<string> {
  return detectLanguageSync(text);
}