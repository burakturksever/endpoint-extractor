import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { classifyLlmError, llmErrorHttpStatus } from "@/lib/llm/llm-errors";
import { clusterEndpointsWithLlmDetailed } from "@/lib/llm/endpoint-clustering";
import { logger } from "@/lib/observability/logger";
import { getAppSettingsForLlm, listEndpointsByIds } from "@/lib/runner/run-store";
import type { EndpointClusterResponse } from "@/lib/types/endpoints";

const bodySchema = z.object({
  endpointIds: z.array(z.string()).min(1).max(5000)
});

export async function POST(request: Request): Promise<NextResponse> {
  const rl = checkRateLimit({ key: "query-cluster", windowMs: 60_000, maxRequests: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many clustering requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const settings = await getAppSettingsForLlm();
  if (!settings.llmEnabled) {
    return NextResponse.json({ error: "LLM features are disabled." }, { status: 403 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const endpoints = await listEndpointsByIds(parsed.data.endpointIds);
  if (endpoints.length === 0) {
    const empty: EndpointClusterResponse = {
      clusters: [],
      meta: { endpointCount: 0, totalInRun: 0, truncated: false }
    };
    return NextResponse.json(empty);
  }
  try {
    const result = await clusterEndpointsWithLlmDetailed(endpoints);
    const payload: EndpointClusterResponse = {
      clusters: result.clusters,
      meta: {
        endpointCount: endpoints.length,
        totalInRun: endpoints.length,
        truncated: false
      },
      assignments: result.assignments
    };
    logger.info("query.cluster.generated", { endpointCount: endpoints.length, clusterCount: result.clusters.length });
    return NextResponse.json(payload);
  } catch (error) {
    const classified = classifyLlmError(error);
    logger.error("query.cluster.failed", {
      code: classified.code,
      message: classified.message,
      endpointCount: endpoints.length
    });
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: llmErrorHttpStatus(classified.code) });
  }
}
