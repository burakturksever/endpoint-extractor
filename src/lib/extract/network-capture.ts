import type { Request } from "playwright";
import type { EndpointCandidate } from "@/lib/extract/endpoint-normalizer";
import type { HttpMethod } from "@/lib/types/endpoints";

export function fromRequest(
  request: Request,
  context?: { originUrl?: string; pageUrl?: string; registrableDomain?: string }
): EndpointCandidate {
  const method = normalizeMethod(request.method());
  const url = request.url();
  const postData = request.postData() ?? "";
  const contentType = request.headers()["content-type"] ?? "";
  const paramKeys = extractParamKeys(url, postData, contentType);

  return {
    sourceType: "network",
    confidence: "high",
    method,
    rawExpression: `${method} ${url}`,
    resolvedUrl: url,
    originUrl: context?.originUrl,
    pageUrl: context?.pageUrl,
    registrableDomain: context?.registrableDomain,
    inferredParams: paramKeys,
    inferenceTrail: `Observed from browser network request${contentType ? ` (${contentType})` : ""}.`
  };
}

function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(upper)
    ? (upper as HttpMethod)
    : "UNKNOWN";
}

function extractParamKeys(url: string, postData: string, contentType: string): string[] {
  const keys = new Set<string>();
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((_, key) => keys.add(key));
  } catch {
    // Intentionally ignore malformed URLs.
  }

  if (postData) {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(postData);
      form.forEach((_, key) => keys.add(key));
    }
    if (contentType.includes("graphql")) {
      const names = Array.from(postData.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)).map((m) => m[1]);
      names.forEach((key) => keys.add(key));
    }
    try {
      const body = JSON.parse(postData) as Record<string, unknown>;
      Object.keys(body).forEach((key) => keys.add(key));
    } catch {
      // Intentionally ignore non-JSON payloads.
    }
  }

  return Array.from(keys);
}
