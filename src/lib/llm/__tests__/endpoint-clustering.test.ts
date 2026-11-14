import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clusterEndpointsWithLlm,
  clusterEndpointsWithLlmDetailed,
  normalizeClustersFromLlm,
  shouldExcludeFromLlmClustering,
  truncateForClusterUrl
} from "@/lib/llm/endpoint-clustering";
import type { EndpointRecord } from "@/lib/types/endpoints";

vi.mock("@/lib/llm/lm-studio-client", () => ({
  lmStudioChatJson: vi.fn()
}));

import { lmStudioChatJson } from "@/lib/llm/lm-studio-client";

function ep(id: string, url = `https://example.org/${id}`): EndpointRecord {
  return {
    id,
    runId: "run-1",
    dedupeHash: id,
    originUrl: "https://example.org",
    registrableDomain: "example.org",
    pageUrl: "https://example.org/",
    sourceType: "network",
    confidence: "high",
    method: "GET",
    rawExpression: url,
    resolvedUrl: url,
    inferredParams: [],
    inferenceTrail: "",
    firstSeenAt: new Date().toISOString()
  };
}

describe("truncateForClusterUrl", () => {
  it("leaves short URLs unchanged", () => {
    expect(truncateForClusterUrl("/a")).toBe("/a");
  });
  it("truncates long URLs", () => {
    const long = "x".repeat(200);
    expect(truncateForClusterUrl(long).length).toBeLessThanOrEqual(160);
    expect(truncateForClusterUrl(long).endsWith("…")).toBe(true);
  });
});

describe("normalizeClustersFromLlm", () => {
  it("drops unknown ids while preserving overlaps for secondary-tag processing", () => {
    const endpoints = [ep("a"), ep("b"), ep("c")];
    const raw = {
      clusters: [
        { id: "g1", label: "One", summary: "s1", endpointIds: ["a", "bogus", "b"] },
        { id: "g2", label: "Two", summary: "s2", endpointIds: ["b", "c"] }
      ]
    };
    const groups = normalizeClustersFromLlm(raw, endpoints);
    const g1 = groups.find((g) => g.id === "g1");
    const g2 = groups.find((g) => g.id === "g2");
    const unc = groups.find((g) => g.id === "unclustered");
    expect(g1?.members.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(g2?.members.map((m) => m.id).sort()).toEqual(["b", "c"]);
    expect(unc).toBeUndefined();
  });

  it("places leftovers in Unclustered", () => {
    const endpoints = [ep("a"), ep("b")];
    const raw = { clusters: [{ id: "g1", label: "One", summary: "", endpointIds: ["a"] }] };
    const groups = normalizeClustersFromLlm(raw, endpoints);
    const unc = groups.find((g) => g.id === "unclustered");
    expect(unc?.members.map((m) => m.id)).toEqual(["b"]);
  });

  it("falls back to one bucket when clusters key is missing", () => {
    const endpoints = [ep("x")];
    const groups = normalizeClustersFromLlm({}, endpoints);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("unclustered");
    expect(groups[0].members).toHaveLength(1);
  });
});

describe("shouldExcludeFromLlmClustering", () => {
  it("excludes static asset urls", () => {
    expect(shouldExcludeFromLlmClustering(ep("s", "https://static.example.com/widget/app.js"))).toBe(true);
  });

  it("keeps API-like urls for LLM", () => {
    expect(shouldExcludeFromLlmClustering(ep("a", "https://api.example.com/v1/users/123"))).toBe(false);
  });
});

describe("clusterEndpointsWithLlm", () => {
  beforeEach(() => {
    vi.mocked(lmStudioChatJson).mockReset();
  });

  it("returns empty array for no endpoints", async () => {
    await expect(clusterEndpointsWithLlm([])).resolves.toEqual([]);
    expect(lmStudioChatJson).not.toHaveBeenCalled();
  });

  it("normalizes model output", async () => {
    const endpoints = [ep("e1"), ep("e2")];
    vi.mocked(lmStudioChatJson).mockResolvedValue({
      clusters: [{ id: "api", label: "API", summary: "x", endpointIds: ["e1", "e2"] }]
    });
    const out = await clusterEndpointsWithLlm(endpoints);
    expect(out).toHaveLength(1);
    expect(out[0].members.map((m) => m.id).sort()).toEqual(["e1", "e2"]);
  });

  it("chunks large sets and excludes noisy urls to miscellaneous", async () => {
    const endpoints: EndpointRecord[] = [];
    for (let i = 0; i < 230; i += 1) {
      endpoints.push(ep(`api-${i}`, `https://api.example.com/v1/items/${i}`));
    }
    endpoints.push(ep("static-1", "https://static.example.com/widget/"));
    vi.mocked(lmStudioChatJson)
      .mockResolvedValueOnce({
        clusters: [{ id: "c1", label: "ChunkOne", summary: "x", endpointIds: ["api-0", "api-1"] }]
      })
      .mockResolvedValueOnce({
        clusters: [{ id: "c2", label: "ChunkTwo", summary: "x", endpointIds: ["api-220"] }]
      });

    const out = await clusterEndpointsWithLlm(endpoints);

    expect(lmStudioChatJson).toHaveBeenCalledTimes(2);
    expect(out.some((g) => g.label === "Miscellaneous" && g.members.some((m) => m.id === "static-1"))).toBe(true);
  });

  it("splits chunk and retries on invalid JSON", async () => {
    const endpoints: EndpointRecord[] = [];
    for (let i = 0; i < 80; i += 1) {
      endpoints.push(ep(`api-r-${i}`, `https://api.example.com/v1/r/${i}`));
    }
    vi.mocked(lmStudioChatJson)
      .mockRejectedValueOnce(new Error("LLM returned invalid JSON."))
      .mockResolvedValue({
        clusters: [{ id: "ok", label: "RetryCluster", summary: "x", endpointIds: ["api-r-0"] }]
      });

    const out = await clusterEndpointsWithLlm(endpoints);
    expect(lmStudioChatJson).toHaveBeenCalledTimes(3);
    expect(out.some((g) => g.label === "RetryCluster")).toBe(true);
  });

  it("creates secondary tags for duplicate cluster membership", async () => {
    const endpoints = [ep("e1"), ep("e2"), ep("e3")];
    vi.mocked(lmStudioChatJson).mockResolvedValue({
      clusters: [
        { id: "users", label: "Users", summary: "u", endpointIds: ["e1", "e2"] },
        { id: "auth", label: "Auth", summary: "a", endpointIds: ["e1", "e3"] }
      ]
    });
    const result = await clusterEndpointsWithLlmDetailed(endpoints);
    const e1 = result.assignments.find((a) => a.endpointId === "e1");
    expect(e1?.primaryClusterId).toBe("users");
    expect(e1?.secondaryTags).toContain("Auth");
    const ids = result.clusters.flatMap((c) => c.members.map((m) => m.id));
    expect(ids.filter((id) => id === "e1")).toHaveLength(1);
  });
});
