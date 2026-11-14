import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { detectGraphqlCandidates } from "@/lib/graphql/detection";
import { logger } from "@/lib/observability/logger";
import { listEndpointsForClustering, runExists } from "@/lib/runner/run-store";
import type { GraphqlDetectionResponse } from "@/lib/types/endpoints";

const bodySchema = z.object({
  runId: z.string().min(1)
});

export async function POST(request: Request): Promise<NextResponse> {
  const rl = checkRateLimit({ key: "graphql-detect", windowMs: 30_000, maxRequests: 30 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many GraphQL detect requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const exists = await runExists(parsed.data.runId);
  if (!exists) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  const rows = await listEndpointsForClustering(parsed.data.runId, 5000);
  const candidates = detectGraphqlCandidates(rows.endpoints);
  const payload: GraphqlDetectionResponse = {
    detected: candidates.length > 0,
    candidates
  };
  logger.info("graphql.detect", { runId: parsed.data.runId, candidates: candidates.length });
  return NextResponse.json(payload);
}
