import type { EndpointRecord, GraphqlDetectionCandidate } from "@/lib/types/endpoints";

function scoreGraphqlEndpoint(endpoint: EndpointRecord): GraphqlDetectionCandidate | null {
  const url = endpoint.resolvedUrl.toLowerCase();
  const raw = endpoint.rawExpression.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (url.includes("/graphql")) {
    score += 3;
    reasons.push("contains /graphql path");
  }
  if (url.includes("graphql?") || url.includes("?query=")) {
    score += 2;
    reasons.push("contains GraphQL query-like URL params");
  }
  if (raw.includes("graphql")) {
    score += 1;
    reasons.push("raw expression references graphql");
  }
  if (raw.includes("__schema") || raw.includes("__typename")) {
    score += 2;
    reasons.push("includes introspection markers");
  }
  if (endpoint.method === "POST") {
    score += 1;
    reasons.push("uses POST");
  }

  if (score <= 0) {
    return null;
  }
  const confidence: "high" | "medium" | "low" = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return {
    endpointId: endpoint.id,
    runId: endpoint.runId,
    url: endpoint.resolvedUrl,
    method: endpoint.method,
    confidence,
    reason: reasons.join(", ")
  };
}

export function detectGraphqlCandidates(endpoints: EndpointRecord[]): GraphqlDetectionCandidate[] {
  const mapped = endpoints
    .map(scoreGraphqlEndpoint)
    .filter((item): item is GraphqlDetectionCandidate => item !== null);
  const dedupedByUrl = new Map<string, GraphqlDetectionCandidate>();
  for (const item of mapped) {
    const key = `${item.method}:${item.url}`;
    const existing = dedupedByUrl.get(key);
    if (!existing) {
      dedupedByUrl.set(key, item);
      continue;
    }
    const rank = { high: 3, medium: 2, low: 1 };
    if (rank[item.confidence] > rank[existing.confidence]) {
      dedupedByUrl.set(key, item);
    }
  }
  return Array.from(dedupedByUrl.values()).sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.confidence] - rank[a.confidence];
  });
}
