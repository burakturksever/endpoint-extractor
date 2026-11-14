import { describe, expect, it } from "vitest";
import { buildTargetTree } from "@/lib/target/tree";
import type { EndpointRecord } from "@/lib/types/endpoints";

function ep(id: string, url: string): EndpointRecord {
  return {
    id,
    runId: "run-target",
    dedupeHash: id,
    originUrl: "https://example.com",
    registrableDomain: "example.com",
    pageUrl: "https://example.com",
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

describe("buildTargetTree", () => {
  it("creates nested hierarchy for endpoint paths", () => {
    const tree = buildTargetTree([
      ep("1", "https://x.test/api/user/getInfo"),
      ep("2", "https://x.test/api/group/getGroup"),
      ep("3", "https://x.test/api/user/getUser?id=123")
    ]);
    expect(tree.map((n) => n.segment)).toEqual(["api"]);
    const api = tree[0];
    const childSegments = api.children.map((c) => c.segment).sort();
    expect(childSegments).toEqual(["group", "user"]);
    const user = api.children.find((c) => c.segment === "user");
    expect(user?.children.map((c) => c.segment).sort()).toEqual(["getInfo", "getUser"]);
  });
});
