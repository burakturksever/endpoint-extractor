import { describe, expect, it } from "vitest";
import { validateLmStudioBaseUrl } from "@/lib/settings/validate-lm-studio-base-url";

describe("validateLmStudioBaseUrl", () => {
  it("accepts http and strips trailing slash", () => {
    const result = validateLmStudioBaseUrl("http://localhost:1234/v1/");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe("http://localhost:1234/v1");
    }
  });

  it("accepts https", () => {
    const result = validateLmStudioBaseUrl("https://lm.example/v1");
    expect(result.ok).toBe(true);
  });

  it("rejects non-http protocols", () => {
    const result = validateLmStudioBaseUrl("ftp://host/v1");
    expect(result.ok).toBe(false);
  });

  it("rejects empty", () => {
    const result = validateLmStudioBaseUrl("  ");
    expect(result.ok).toBe(false);
  });
});
