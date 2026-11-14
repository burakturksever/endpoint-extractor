import { describe, expect, it } from "vitest";
import { parseRawHeaders, truncateForStorage } from "@/lib/repeater/http";

describe("parseRawHeaders", () => {
  it("parses valid header lines", () => {
    const parsed = parseRawHeaders("Authorization: Bearer a\nContent-Type: application/json");
    expect(parsed).toEqual({
      Authorization: "Bearer a",
      "Content-Type": "application/json"
    });
  });

  it("ignores malformed and blank lines", () => {
    const parsed = parseRawHeaders("BadLine\nX-Test: one\n\n: nope");
    expect(parsed).toEqual({
      "X-Test": "one"
    });
  });
});

describe("truncateForStorage", () => {
  it("returns original string when within limit", () => {
    expect(truncateForStorage("abc", 3)).toBe("abc");
  });

  it("truncates and appends marker when oversized", () => {
    expect(truncateForStorage("abcdef", 4)).toBe("abcd\n[truncated 2 chars]");
  });
});
