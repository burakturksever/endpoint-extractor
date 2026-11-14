export function validateLmStudioBaseUrl(url: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "Base URL is required." };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Base URL must use http or https." };
    }
    return { ok: true, normalized: parsed.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false, error: "Invalid base URL." };
  }
}
