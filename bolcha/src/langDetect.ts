// src/langDetect.ts

// Return a 2-letter ISO-639-1 code in lowercase (e.g. "ja", "en")
function normalize(code: string): string {
  return (code || "en").slice(0, 2).toLowerCase();
}

export function detectLanguageSync(text: string): string {
  const t = (text || '').trim();
  if (!t) return normalize('en');
  if (/^[\u0000-\u007f]+$/.test(t)) return normalize('en');         // ASCII
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(t)) return normalize('ja'); // Hiragana/Katakana
  if (/[\uac00-\ud7af]/.test(t))       return normalize('ko');        // Hangul
  if (/[\u4e00-\u9fff]/.test(t))       return normalize('zh');        // CJK Ideographs
  return normalize('en');
}

export async function detectLanguage(text: string): Promise<string> {
  return normalize(detectLanguageSync(text));
}