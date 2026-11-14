import { describe, expect, it } from "vitest";
import { normalizeHttpUrlForRepeater } from "@/lib/repeater/request-normalization";

describe("normalizeHttpUrlForRepeater", () => {
  it("accepts valid https URL", () => {
    const r = normalizeHttpUrlForRepeater("https://example.com/path?q=1");
    expect(r.ok && r.url).toBeTruthy();
    if (r.ok) expect(r.url).toContain("example.com");
  });

  it("prefixes scheme-relative URLs", () => {
    const r = normalizeHttpUrlForRepeater("//cdn.example.com/x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.startsWith("https://")).toBe(true);
  });

  it("prefixes https for host-like strings without scheme", () => {
    const r = normalizeHttpUrlForRepeater("example.com/api/v1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toMatch(/^https:\/\/example\.com\//);
  });

  it("rejects plain relative paths", () => {
    const r = normalizeHttpUrlForRepeater("/api/foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("relative_url");
  });

  it("rejects empty", () => {
    const r = normalizeHttpUrlForRepeater("  ");
    expect(r.ok).toBe(false);
  });
});
