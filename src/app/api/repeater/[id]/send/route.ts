import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { logger } from "@/lib/observability/logger";
import { parseRawHeaders, truncateForStorage } from "@/lib/repeater/http";
import { repeaterUrlSchema } from "@/lib/repeater/zod-url";
import { saveRepeaterResponse } from "@/lib/runner/run-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const sendSchema = z.object({
  method: z.string().min(1).max(16),
  url: repeaterUrlSchema,
  headers: z.string().max(50_000).default(""),
  body: z.string().max(2_000_000).optional()
});
const MAX_STORED_RESPONSE_HEADERS = 100_000;
const MAX_STORED_RESPONSE_BODY = 1_000_000;

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const rl = checkRateLimit({ key: `repeater-send:${id}`, windowMs: 60_000, maxRequests: 40 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many repeater sends.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: first ?? "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  const started = Date.now();
  const response = await fetch(parsed.data.url, {
    method: parsed.data.method.toUpperCase(),
    headers: parseRawHeaders(parsed.data.headers),
    body: parsed.data.body
  }).catch((error) => error as Error);

  if (response instanceof Error) {
    logger.error("repeater.send.failed", { id, message: response.message });
    return NextResponse.json({ error: response.message }, { status: 502 });
  }

  const bodyText = await response.text();
  const responseHeadersRaw = Array.from(response.headers.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const responseHeaders = truncateForStorage(responseHeadersRaw, MAX_STORED_RESPONSE_HEADERS);
  const responseBody = truncateForStorage(bodyText, MAX_STORED_RESPONSE_BODY);
  const durationMs = Date.now() - started;
  const saved = await saveRepeaterResponse({
    id,
    status: response.status,
    headers: responseHeaders,
    body: responseBody,
    durationMs
  });
  logger.info("repeater.send.completed", { id, status: response.status, durationMs });
  return NextResponse.json({
    response: {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
      durationMs
    },
    request: saved
  });
}
