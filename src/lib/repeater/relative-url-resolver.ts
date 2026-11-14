import type { EndpointRecord } from "@/lib/types/endpoints";

export interface RelativeUrlResolveCandidate {
  baseOrigin: string;
  resolvedUrl: string;
  source: "endpoint.originUrl" | "endpoint.pageUrl" | "run.targetUrl" | "run.endpoints";
}

export interface RelativeUrlResolveResult {
  canResolve: boolean;
  candidates: RelativeUrlResolveCandidate[];
  reason?: string;
}

export function resolveRelativeUrlCandidates(input: {
  relativeUrl: string;
  endpoint?: Pick<EndpointRecord, "originUrl" | "pageUrl"> | null;
  runTargetUrl?: string | null;
  runEndpoints?: Array<Pick<EndpointRecord, "originUrl" | "pageUrl">>;
  maxCandidates?: number;
}): RelativeUrlResolveResult {
  const relative = input.relativeUrl.trim();
  if (!relative.startsWith("/")) {
    return { canResolve: false, candidates: [], reason: "URL is not relative." };
  }
  const candidates: RelativeUrlResolveCandidate[] = [];
  const seenOrigins = new Set<string>();
  const maxCandidates = Math.max(1, input.maxCandidates ?? 8);

  const pushOrigin = (raw: string | null | undefined, source: RelativeUrlResolveCandidate["source"]): void => {
    const origin = extractOrigin(raw);
    if (!origin || seenOrigins.has(origin)) {
      return;
    }
    seenOrigins.add(origin);
    candidates.push({
      baseOrigin: origin,
      resolvedUrl: new URL(relative, `${origin}/`).toString(),
      source
    });
  };

  pushOrigin(input.endpoint?.originUrl, "endpoint.originUrl");
  pushOrigin(input.endpoint?.pageUrl, "endpoint.pageUrl");
  pushOrigin(input.runTargetUrl, "run.targetUrl");
  for (const item of input.runEndpoints ?? []) {
    if (candidates.length >= maxCandidates) {
      break;
    }
    pushOrigin(item.originUrl, "run.endpoints");
    if (candidates.length >= maxCandidates) {
      break;
    }
    pushOrigin(item.pageUrl, "run.endpoints");
  }
  return candidates.length > 0
    ? { canResolve: true, candidates }
    : { canResolve: false, candidates: [], reason: "No origin candidates available." };
}

function extractOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
