import { describe, expect, it } from "vitest";
import { detectGraphqlCandidates } from "@/lib/graphql/detection";
import type { EndpointRecord } from "@/lib/types/endpoints";

function ep(id: string, url: string, method: EndpointRecord["method"] = "POST", raw = url): EndpointRecord {
  return {
    id,
    runId: "run-gql",
    dedupeHash: id,
    originUrl: "https://example.com",
    registrableDomain: "example.com",
    pageUrl: "https://example.com",
    sourceType: "network",
    confidence: "high",
    method,
    rawExpression: raw,
    resolvedUrl: url,
    inferredParams: [],
    inferenceTrail: "",
    firstSeenAt: new Date().toISOString()
  };
}

describe("detectGraphqlCandidates", () => {
  it("detects /graphql endpoints with high confidence", () => {
    const out = detectGraphqlCandidates([ep("a", "https://api.example.com/graphql")]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("high");
  });

  it("deduplicates method+url candidates", () => {
    const out = detectGraphqlCandidates([
      ep("a", "https://api.example.com/graphql"),
      ep("b", "https://api.example.com/graphql")
    ]);
    expect(out).toHaveLength(1);
  });

  it("returns empty when no graphql hints exist", () => {
    const out = detectGraphqlCandidates([ep("a", "https://api.example.com/v1/users", "GET")]);
    expect(out).toHaveLength(0);
  });
});
