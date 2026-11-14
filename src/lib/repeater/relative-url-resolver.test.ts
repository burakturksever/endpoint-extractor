import { describe, expect, it } from "vitest";
import { resolveRelativeUrlCandidates } from "@/lib/repeater/relative-url-resolver";

describe("resolveRelativeUrlCandidates", () => {
  it("returns candidates in priority order with dedupe", () => {
    const result = resolveRelativeUrlCandidates({
      relativeUrl: "/api/users?id=1",
      endpoint: {
        originUrl: "https://app.example.com/home",
        pageUrl: "https://app.example.com/dashboard"
      },
      runTargetUrl: "https://api.example.com/start",
      runEndpoints: [
        { originUrl: "https://api.example.com/one", pageUrl: "https://cdn.example.com/page" },
        { originUrl: "https://app.example.com/duplicate", pageUrl: "https://static.example.com/page" }
      ]
    });

    expect(result.canResolve).toBe(true);
    expect(result.candidates.map((c) => c.baseOrigin)).toEqual([
      "https://app.example.com",
      "https://api.example.com",
      "https://cdn.example.com",
      "https://static.example.com"
    ]);
    expect(result.candidates[0]?.resolvedUrl).toBe("https://app.example.com/api/users?id=1");
  });

  it("returns unresolved when no usable origins exist", () => {
    const result = resolveRelativeUrlCandidates({
      relativeUrl: "/api/users",
      runEndpoints: [{ originUrl: "not-a-url", pageUrl: "" }]
    });
    expect(result.canResolve).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
