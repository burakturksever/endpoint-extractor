import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { enumerateGraphqlEndpoint } from "@/lib/graphql/enumeration";
import { logger } from "@/lib/observability/logger";
import type { GraphqlEnumerationResponse } from "@/lib/types/endpoints";

const bodySchema = z.object({
  endpointUrl: z.string().min(1),
  headers: z.string().optional(),
  authToken: z.string().optional(),
  operation: z.string().optional(),
  variablesJson: z.string().optional(),
  runId: z.string().optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  const rl = checkRateLimit({ key: "graphql-enumerate", windowMs: 60_000, maxRequests: 20 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many GraphQL enumerate requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result: GraphqlEnumerationResponse = await enumerateGraphqlEndpoint({
    endpointUrl: parsed.data.endpointUrl,
    headers: parsed.data.headers,
    authToken: parsed.data.authToken,
    operation: parsed.data.operation,
    variablesJson: parsed.data.variablesJson
  });
  logger.info("graphql.enumerate", {
    runId: parsed.data.runId ?? null,
    endpointUrl: result.endpointUrl,
    introspectionAvailable: result.introspectionAvailable,
    typenameProbeOk: result.typenameProbeOk,
    ok: result.ok
  });
  return NextResponse.json(result);
}
