import { describe, expect, it } from "vitest";
import { buildEndpointUpdate, shouldPreferIncomingSnapshot } from "@/lib/runner/run-store";
import type { EndpointRecord } from "@/lib/types/endpoints";

function incoming(overrides?: Partial<EndpointRecord>): EndpointRecord {
  return {
    id: "new-id",
    runId: "run-1",
    dedupeHash: "hash-1",
    originUrl: "https://example.com",
    registrableDomain: "example.com",
    pageUrl: "https://example.com",
    sourceType: "network",
    confidence: "high",
    method: "GET",
    rawExpression: "GET https://example.com/api/user/login",
    resolvedUrl: "https://example.com/api/user/login",
    inferredParams: [],
    inferenceTrail: "incoming",
    firstSeenAt: new Date().toISOString(),
    ...overrides
  };
}

describe("shouldPreferIncomingSnapshot", () => {
  it("always prefers incoming high over non-high", () => {
    expect(
      shouldPreferIncomingSnapshot(
        { sourceType: "network", confidence: "medium", rawExpression: "x.get('/a')" },
        { sourceType: "network", confidence: "high", rawExpression: "GET /a" }
      )
    ).toBe(true);
  });

  it("keeps existing high over incoming non-high", () => {
    expect(
      shouldPreferIncomingSnapshot(
        { sourceType: "network", confidence: "high", rawExpression: "GET /a" },
        { sourceType: "static", confidence: "low", rawExpression: "something" }
      )
    ).toBe(false);
  });

  it("does not let noisy medium promise-like override low static", () => {
    expect(
      shouldPreferIncomingSnapshot(
        { sourceType: "static", confidence: "low", rawExpression: "fetch('/api/user/login')" },
        { sourceType: "promise", confidence: "medium", rawExpression: "client.get('/api/user/login').then(...)" }
      )
    ).toBe(false);
  });
});

describe("buildEndpointUpdate", () => {
  it("merges parameter names and keeps best snapshot", () => {
    const existing = {
      sourceType: "network",
      confidence: "high",
      rawExpression: "GET https://example.com/api/user/login?_s=1",
      resolvedUrl: "https://example.com/api/user/login",
      inferredParams: JSON.stringify(["_s"]),
      inferenceTrail: "existing"
    };
    const update = buildEndpointUpdate(
      existing,
      incoming({
        sourceType: "static",
        confidence: "low",
        rawExpression: "fetch('/api/user/login?_r=2')",
        inferredParams: ["_r"]
      })
    );
    expect(update.confidence).toBe("high");
    expect(update.sourceType).toBe("network");
    expect(JSON.parse(update.inferredParams)).toEqual(["_r", "_s"]);
  });
});
