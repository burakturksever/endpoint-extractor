/** Human-readable seed URL for dropdowns (origin + path, no query/hash). */
export function formatSeedUrlForDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Unknown target";
  }
  try {
    const u = new URL(trimmed);
    const origin = u.origin;
    const path = u.pathname.replace(/\/$/, "") || "";
    let out = path ? `${origin}${path}` : origin;
    if (out.length > 72) {
      out = `${out.slice(0, 70)}…`;
    }
    return out;
  } catch {
    return trimmed.length > 72 ? `${trimmed.slice(0, 70)}…` : trimmed;
  }
}

export function runSelectDisplayLabel(run: { id: string; targetUrl?: string; status: string }, allRuns: Array<{ id: string; targetUrl?: string; status: string }>): string {
  const seed = formatSeedUrlForDisplay(run.targetUrl ?? "");
  const base = `${seed} · ${run.status}`;
  const sameSeedAndStatus = allRuns.filter(
    (r) => formatSeedUrlForDisplay(r.targetUrl ?? "") === seed && r.status === run.status
  );
  if (sameSeedAndStatus.length <= 1) {
    return base;
  }
  return `${base} (#${run.id.slice(-6)})`;
}

export function batchTargetSummary(urls: string[]): string {
  const labels = urls.map((u) => formatSeedUrlForDisplay(u));
  const unique = [...new Set(labels)];
  if (unique.length === 0) {
    return "No targets";
  }
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length === 2) {
    return `${unique[0]}; ${unique[1]}`;
  }
  return `${unique[0]}; ${unique[1]} +${unique.length - 2}`;
}
