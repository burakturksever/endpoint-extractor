const buckets = new Map<string, number[]>();

export function checkRateLimit(input: { key: string; windowMs: number; maxRequests: number }): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const threshold = now - input.windowMs;
  const current = (buckets.get(input.key) ?? []).filter((value) => value >= threshold);
  if (current.length >= input.maxRequests) {
    const oldest = current[0] ?? now;
    return { allowed: false, retryAfterMs: Math.max(0, input.windowMs - (now - oldest)) };
  }
  current.push(now);
  buckets.set(input.key, current);
  return { allowed: true, retryAfterMs: 0 };
}
