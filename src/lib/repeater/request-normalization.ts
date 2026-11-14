export type NormalizeHttpUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: "relative_url" };

/** Normalize extracted endpoint URLs so repeater storage/send validation accepts them (scheme-relative, missing scheme, etc.). */
export function normalizeHttpUrlForRepeater(input: string): NormalizeHttpUrlResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "URL is empty." };
  }
  let s = trimmed;
  if (s.startsWith("//")) {
    s = `https:${s}`;
  } else if (!/^https?:\/\//i.test(s)) {
    if (s.startsWith("/")) {
      return {
        ok: false,
        code: "relative_url",
        error: "Relative URLs are not supported; use a full URL or an endpoint whose resolved URL is absolute."
      };
    }
    const hostPart = s.split("/")[0] ?? "";
    const looksLikeHost =
      /^localhost(?::\d+)?$/i.test(hostPart) ||
      /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/.test(hostPart);
    if (looksLikeHost) {
      s = `https://${s.replace(/^\/+/, "")}`;
    } else {
      return {
        ok: false,
        error: "Could not normalize URL; paste a full https:// URL or fix the endpoint resolved URL."
      };
    }
  }
  try {
    const u = new URL(s);
    if (!u.hostname) {
      return { ok: false, error: "Invalid URL (no host)." };
    }
    return { ok: true, url: u.href };
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
}
