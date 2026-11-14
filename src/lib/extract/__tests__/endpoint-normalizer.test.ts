import { describe, expect, it } from "vitest";
import { normalizeEndpoint } from "@/lib/extract/endpoint-normalizer";

describe("normalizeEndpoint", () => {
  it("normalizes and deduplicates params", () => {
    const endpoint = normalizeEndpoint("run-1", {
      sourceType: "static",
      confidence: "medium",
      method: "GET",
      rawExpression: " fetch('/api/v1/user') ",
      resolvedUrl: "'/api/v1/user'",
      inferredParams: ["userId", "userId", "teamId"],
      inferenceTrail: "test"
    });

    expect(endpoint.runId).toBe("run-1");
    expect(endpoint.resolvedUrl).toBe("/api/v1/user");
    expect(endpoint.originUrl).toBe("/");
    expect(endpoint.pageUrl).toBe("/");
    expect(endpoint.registrableDomain).toBe("unknown");
    expect(endpoint.inferredParams).toEqual(["teamId", "userId"]);
    expect(endpoint.dedupeHash.length).toBeGreaterThan(8);
  });

  it("collapses same-method query-value variants into one dedupe identity", () => {
    const a = normalizeEndpoint("run-1", {
      sourceType: "network",
      confidence: "high",
      method: "GET",
      rawExpression: "GET https://example.com/api/user/login?_s=12345",
      resolvedUrl: "https://example.com/api/user/login?_s=12345",
      inferredParams: ["_s"],
      inferenceTrail: "a"
    });
    const b = normalizeEndpoint("run-1", {
      sourceType: "static",
      confidence: "medium",
      method: "GET",
      rawExpression: "fetch('https://example.com/api/user/login?_s=67890')",
      resolvedUrl: "https://example.com/api/user/login?_s=67890",
      inferredParams: ["_s"],
      inferenceTrail: "b"
    });

    expect(a.resolvedUrl).toBe("https://example.com/api/user/login");
    expect(b.resolvedUrl).toBe("https://example.com/api/user/login");
    expect(a.dedupeHash).toBe(b.dedupeHash);
    expect(a.inferredParams).toEqual(["_s"]);
  });

  it("keeps different methods as separate endpoint identities", () => {
    const getEndpoint = normalizeEndpoint("run-1", {
      sourceType: "network",
      confidence: "high",
      method: "GET",
      rawExpression: "GET https://example.com/api/user/login",
      resolvedUrl: "https://example.com/api/user/login",
      inferredParams: [],
      inferenceTrail: "get"
    });
    const postEndpoint = normalizeEndpoint("run-1", {
      sourceType: "network",
      confidence: "high",
      method: "POST",
      rawExpression: "POST https://example.com/api/user/login",
      resolvedUrl: "https://example.com/api/user/login",
      inferredParams: [],
      inferenceTrail: "post"
    });
    expect(getEndpoint.dedupeHash).not.toBe(postEndpoint.dedupeHash);
  });
});
