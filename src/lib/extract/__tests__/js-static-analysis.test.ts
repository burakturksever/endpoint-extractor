import { describe, expect, it } from "vitest";
import { extractStaticCandidates } from "@/lib/extract/js-static-analysis";

describe("extractStaticCandidates", () => {
  it("extracts axios and fetch paths", () => {
    const code = `
      const base = "https://api.example.com";
      fetch(base + "/v2/asset/internal/transfer/recordList");
      apiClient.post("/api/v1/user/getInfo", { userId: 1 });
    `;
    const results = extractStaticCandidates(code);
    const urls = results.map((item) => item.resolvedUrl);
    expect(urls.some((url) => url.includes("/v2/asset/internal/transfer/recordList"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/user/getInfo"))).toBe(true);
  });
});
