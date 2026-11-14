import { createHash, randomUUID } from "node:crypto";
import type { EndpointConfidence, EndpointRecord, EndpointSourceType, HttpMethod } from "@/lib/types/endpoints";

export interface EndpointCandidate {
  sourceType: EndpointSourceType;
  confidence: EndpointConfidence;
  method: HttpMethod;
  rawExpression: string;
  resolvedUrl: string;
  originUrl?: string;
  pageUrl?: string;
  registrableDomain?: string;
  inferredParams?: string[];
  inferenceTrail?: string;
}

export function normalizeEndpoint(runId: string, candidate: EndpointCandidate): EndpointRecord {
  const normalizedUrl = sanitizeUrl(candidate.resolvedUrl);
  const canonicalUrl = canonicalizeEndpointUrl(normalizedUrl);
  const normalizedOrigin = sanitizeUrl(candidate.originUrl ?? safeOrigin(canonicalUrl));
  const normalizedPageUrl = sanitizeUrl(candidate.pageUrl ?? normalizedOrigin);
  const registrableDomain = sanitizeDomain(candidate.registrableDomain ?? extractRegistrableDomain(normalizedOrigin));
  const mergedParams = Array.from(new Set(extractQueryParamNames(normalizedUrl).concat(candidate.inferredParams ?? []))).sort();
  const dedupeHash = createHash("sha1")
    .update(`${candidate.method}|${canonicalUrl}`)
    .digest("hex");
  return {
    id: randomUUID(),
    runId,
    dedupeHash,
    originUrl: normalizedOrigin,
    registrableDomain,
    pageUrl: normalizedPageUrl,
    sourceType: candidate.sourceType,
    confidence: candidate.confidence,
    method: candidate.method,
    rawExpression: candidate.rawExpression.trim().slice(0, 1000),
    resolvedUrl: canonicalUrl,
    inferredParams: mergedParams,
    inferenceTrail: candidate.inferenceTrail ?? "",
    firstSeenAt: new Date().toISOString()
  };
}

function sanitizeUrl(url: string): string {
  const value = url.trim();
  if (!value) {
    return "/";
  }
  return value.replace(/["'`]/g, "");
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "/";
  }
}

function extractRegistrableDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const chunks = hostname.split(".").filter(Boolean);
    if (chunks.length <= 2) {
      return hostname;
    }
    return chunks.slice(-2).join(".");
  } catch {
    return "unknown";
  }
}

function sanitizeDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  return value || "unknown";
}

function canonicalizeEndpointUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const normalizedPath = normalizePathname(parsed.pathname);
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    const base = url.split("?")[0] ?? url;
    return normalizePathname(base);
  }
}

function normalizePathname(pathname: string): string {
  const clean = pathname.trim() || "/";
  const noQuotes = clean.replace(/["'`]/g, "");
  const withSlash = noQuotes.startsWith("/") ? noQuotes : `/${noQuotes}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

function extractQueryParamNames(url: string): string[] {
  const names = new Set<string>();
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((_, key) => names.add(key));
    return Array.from(names);
  } catch {
    const idx = url.indexOf("?");
    if (idx < 0) return [];
    const query = url.slice(idx + 1);
    for (const part of query.split("&")) {
      const key = part.split("=")[0]?.trim();
      if (key) names.add(decodeURIComponent(key));
    }
    return Array.from(names);
  }
}
