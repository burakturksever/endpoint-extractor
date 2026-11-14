import { describe, expect, it } from "vitest";
import { extractPromiseCandidates } from "@/lib/extract/promise-analysis";

describe("extractPromiseCandidates", () => {
  it("finds promise endpoint hints and params", () => {
    const code = `
      Promise.resolve().then(() => {
        return apiClient.post('/api/v1/user/getInfo', { userId: 1, tenantId: 'x' });
      });
    `;
    const candidates = extractPromiseCandidates(code);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.resolvedUrl).toContain("/api/v1/user/getInfo");
    expect(candidates[0]?.method).toBe("POST");
  });
});
