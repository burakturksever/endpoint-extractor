import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/query/route";

vi.mock("@/lib/db", () => ({
  prisma: {
    endpoint: {
      findMany: vi.fn()
    }
  }
}));

import { prisma } from "@/lib/db";

describe("GET /api/query", () => {
  it("returns cursor pagination fields", async () => {
    const rows = Array.from({ length: 21 }, (_, idx) => ({
      id: `e${idx + 1}`,
      runId: "r1",
      dedupeHash: `d${idx + 1}`,
      originUrl: "https://app.example.com",
      registrableDomain: "example.com",
      pageUrl: "https://app.example.com/p",
      resolvedUrl: `https://app.example.com/api/${idx + 1}`,
      method: "GET",
      sourceType: "network",
      confidence: "high",
      rawExpression: `fetch('/api/${idx + 1}')`,
      inferredParams: "[]",
      inferenceTrail: "",
      firstSeenAt: new Date()
    }));
    vi.mocked(prisma.endpoint.findMany).mockResolvedValueOnce(rows as never);

    const request = new Request("http://localhost/api/query?q=api&pageSize=20");
    const response = await GET(request);
    const payload = (await response.json()) as { total: number; nextCursor: string | null; groups: Array<{ endpoints: unknown[] }> };
    expect(response.status).toBe(200);
    expect(payload.total).toBe(21);
    expect(payload.nextCursor).toBe("e20");
    const pageCount = payload.groups.reduce((sum, item) => sum + item.endpoints.length, 0);
    expect(pageCount).toBe(20);
  });
});
