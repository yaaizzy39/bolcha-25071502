// Utility to call custom GAS translation API endpoints in a round-robin fashion
// GAS endpoint list is provided via `VITE_GAS_ENDPOINTS` (comma-separated URLs)

const endpoints = (import.meta.env.VITE_GAS_ENDPOINTS as string | undefined)
  ?.split(/[, ]+/)
  .filter(Boolean) ?? [];

let cursor = 0;

export async function translateText(text: string, targetLang: string): Promise<string | null> {
  if (!endpoints.length) {
    console.warn("No GAS endpoints configured");
    return null;
  }
  // Pick endpoint round-robin
  const url = endpoints[cursor % endpoints.length];
  cursor += 1;

  try {
    // attempt POST (preferred)
    const postRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetLang }),
    });
    if (postRes.ok) {
      const maybeJson = await safeParse(postRes);
      return maybeJson;
    }
  } catch {}

  // fallback: GET (no preflight)
  try {
    const params = new URLSearchParams({ text, target: targetLang });
    const getRes = await fetch(`${url}?${params.toString()}`);
    if (!getRes.ok) throw new Error("Non-200 response");
    const maybeJson = await safeParse(getRes);
    return maybeJson;
  } catch (err) {
    console.error("Translate error", err);
    return null;
  }
}

async function safeParse(res: Response): Promise<string | null> {
  try {
    const txt = await res.text();
    if (!txt) return null;
    try {
      const obj = JSON.parse(txt);
      // tolerate different property names
      return (
        obj.translatedText ||
        obj.text ||
        obj.translation ||
        null
      );
    } catch {
      return txt; // plain text
    }
  } catch {
    return null;
  }
}
