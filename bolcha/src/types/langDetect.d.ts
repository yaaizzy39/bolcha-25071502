declare module "../langDetect" {
  export function detectLanguage(text: string): Promise<string>;
  export function detectLanguageSync(text: string): string;
}
