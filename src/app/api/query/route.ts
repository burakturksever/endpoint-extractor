import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { logger } from "@/lib/observability/logger";

interface QueryResultGroup {
  siteUrl: string;
  domain: string;
  endpoints: Array<{
    id: string;
    runId: string;
    dedupeHash: string;
    originUrl: string;
    registrableDomain: string;
    pageUrl: string;
    resolvedUrl: string;
    method: string;
    sourceType: string;
    confidence: string;
    rawExpression: string;
    inferredParams: string[];
    inferenceTrail: string;
    firstSeenAt: string;
  }>;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const regexMode = url.searchParams.get("regex") === "true";
  const flags = sanitizeFlags(url.searchParams.get("flags") ?? "");
  const runId = url.searchParams.get("runId") ?? "";
  const limit = Math.min(4000, Math.max(50, Number(url.searchParams.get("limit") ?? "500")));
  const cursor = (url.searchParams.get("cursor") ?? "").trim();
  const pageSize = Math.min(300, Math.max(20, Number(url.searchParams.get("pageSize") ?? "120")));

  const rl = checkRateLimit({
    key: `query:${runId || "all"}`,
    windowMs: 15_000,
    maxRequests: 30
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many query requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  const rows = await prisma.endpoint.findMany({
    where: runId ? { runId } : undefined,
    orderBy: { firstSeenAt: "desc" },
    take: limit
  });

  let matcher: RegExp | null = null;
  if (query && regexMode) {
    try {
      matcher = new RegExp(query, flags);
    } catch {
      matcher = null;
    }
  }

  const filtered = rows.filter((row) => {
    if (!query) {
      return true;
    }
    const haystack = `${row.resolvedUrl}\n${row.rawExpression}\n${row.method}\n${row.sourceType}`;
    if (matcher) {
      return matcher.test(haystack);
    }
    return haystack.toLowerCase().includes(query.toLowerCase());
  });

  const startIndex = cursor ? Math.max(0, filtered.findIndex((row) => row.id === cursor) + 1) : 0;
  const pageRows = filtered.slice(startIndex, startIndex + pageSize);
  const nextCursor = startIndex + pageSize < filtered.length ? pageRows[pageRows.length - 1]?.id ?? null : null;

  const grouped = new Map<string, QueryResultGroup>();
  for (const row of pageRows) {
    const key = `${row.originUrl}::${row.registrableDomain}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        siteUrl: row.originUrl,
        domain: row.registrableDomain,
        endpoints: []
      });
    }
    grouped.get(key)!.endpoints.push({
      id: row.id,
      runId: row.runId,
        dedupeHash: row.dedupeHash,
        originUrl: row.originUrl,
        registrableDomain: row.registrableDomain,
        pageUrl: row.pageUrl,
      resolvedUrl: row.resolvedUrl,
      method: row.method,
      sourceType: row.sourceType,
      confidence: row.confidence,
      rawExpression: row.rawExpression,
        inferredParams: safeParseParams(row.inferredParams),
        inferenceTrail: row.inferenceTrail,
      firstSeenAt: row.firstSeenAt.toISOString()
    });
  }
  logger.info("query.executed", {
    runId: runId || null,
    queryLength: query.length,
    regexMode,
    totalMatches: filtered.length,
    pageCount: pageRows.length,
    hasNextCursor: Boolean(nextCursor)
  });

  return NextResponse.json({
    query,
    regexMode,
    flags,
    total: filtered.length,
    groups: Array.from(grouped.values()),
    pageSize,
    cursor: cursor || null,
    nextCursor
  });
}

function sanitizeFlags(flags: string): string {
  return Array.from(new Set(flags.split("").filter((flag) => "dgimsuy".includes(flag)))).join("");
}

function safeParseParams(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
