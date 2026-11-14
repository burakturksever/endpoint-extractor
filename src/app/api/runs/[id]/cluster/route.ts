import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { classifyLlmError, llmErrorHttpStatus } from "@/lib/llm/llm-errors";
import { clusterEndpointsWithLlmDetailed } from "@/lib/llm/endpoint-clustering";
import { logger } from "@/lib/observability/logger";
import {
  clearRunClusterSnapshot,
  getAppSettingsForLlm,
  getRunClusterSnapshot,
  listEndpointsForClustering,
  MAX_ENDPOINTS_FOR_CLUSTERING,
  runExists,
  upsertRunClusterSnapshot
} from "@/lib/runner/run-store";
import type { EndpointClusterResponse } from "@/lib/types/endpoints";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  limit: z.number().int().positive().max(MAX_ENDPOINTS_FOR_CLUSTERING).optional(),
  force: z.boolean().optional()
});

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id: runId } = await context.params;
  const rl = checkRateLimit({ key: `cluster:${runId}`, windowMs: 60_000, maxRequests: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many clustering requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const settings = await getAppSettingsForLlm();
  if (!settings.llmEnabled) {
    return NextResponse.json({ error: "LLM features are disabled." }, { status: 403 });
  }
  const exists = await runExists(runId);
  if (!exists) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const force = parsed.data.force === true;
  const { endpoints, totalInRun } = await listEndpointsForClustering(runId, parsed.data.limit);
  if (endpoints.length === 0) {
    await clearRunClusterSnapshot(runId);
    const empty: EndpointClusterResponse = {
      clusters: [],
      meta: { endpointCount: 0, totalInRun, truncated: totalInRun > 0 }
    };
    return NextResponse.json(empty);
  }
  if (!force) {
    const snapshot = await getRunClusterSnapshot(runId);
    if (snapshot) {
      const cachedPayload: EndpointClusterResponse = {
        clusters: snapshot.clusters,
        assignments: snapshot.assignments,
        meta: {
          endpointCount: endpoints.length,
          totalInRun,
          truncated: totalInRun > endpoints.length,
          cached: true,
          endpointCountAtBuild: snapshot.endpointCountAtBuild,
          savedAt: snapshot.updatedAt
        }
      };
      logger.info("run.cluster.cached", {
        runId,
        endpointCount: endpoints.length,
        totalInRun,
        endpointCountAtBuild: snapshot.endpointCountAtBuild
      });
      return NextResponse.json(cachedPayload);
    }
  }
  try {
    const result = await clusterEndpointsWithLlmDetailed(endpoints);
    await upsertRunClusterSnapshot({
      runId,
      clusters: result.clusters,
      assignments: result.assignments,
      endpointCountAtBuild: endpoints.length
    });
    const payload: EndpointClusterResponse = {
      clusters: result.clusters,
      meta: {
        endpointCount: endpoints.length,
        totalInRun,
        truncated: totalInRun > endpoints.length,
        cached: false,
        endpointCountAtBuild: endpoints.length,
        savedAt: new Date().toISOString()
      },
      assignments: result.assignments
    };
    logger.info("run.cluster.generated", { runId, endpointCount: endpoints.length, totalInRun, clusterCount: result.clusters.length });
    return NextResponse.json(payload);
  } catch (error) {
    const classified = classifyLlmError(error);
    logger.error("run.cluster.failed", { runId, code: classified.code, message: classified.message });
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: llmErrorHttpStatus(classified.code) });
  }
}
