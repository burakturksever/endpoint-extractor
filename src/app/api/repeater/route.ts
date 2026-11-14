import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { logger } from "@/lib/observability/logger";
import { repeaterUrlSchema } from "@/lib/repeater/zod-url";
import { listRepeaterRequests, upsertRepeaterRequest } from "@/lib/runner/run-store";

const createSchema = z.object({
  id: z.string().optional(),
  runId: z.string().min(1),
  endpointId: z.string().optional(),
  method: z.string().min(1).max(16),
  url: repeaterUrlSchema,
  headers: z.string().max(50_000).default(""),
  body: z.string().max(2_000_000).optional()
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? undefined;
  const endpointId = url.searchParams.get("endpointId") ?? undefined;
  const requests = await listRepeaterRequests({ runId, endpointId });
  return NextResponse.json({ requests });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rl = checkRateLimit({ key: "repeater-save", windowMs: 60_000, maxRequests: 120 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: first ?? "Invalid request.", details: flat }, { status: 400 });
  }
  const saved = await upsertRepeaterRequest(parsed.data);
  logger.info("repeater.saved", { runId: saved.runId, endpointId: saved.endpointId, id: saved.id });
  return NextResponse.json({ request: saved });
}
