import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { logger } from "@/lib/observability/logger";
import { listOrganizerItems, upsertOrganizerItem } from "@/lib/runner/run-store";
import type { OrganizerLabel } from "@/lib/types/endpoints";

const labels = ["Finding", "Potential Finding", "Note"] as const;

const createSchema = z.object({
  id: z.string().optional(),
  runId: z.string().min(1),
  endpointId: z.string().optional(),
  repeaterRequestId: z.string().optional(),
  label: z.enum(labels),
  description: z.string().min(1).max(10_000)
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? undefined;
  const label = (url.searchParams.get("label") as OrganizerLabel | null) ?? undefined;
  const items = await listOrganizerItems({ runId, label });
  return NextResponse.json({ items });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rl = checkRateLimit({ key: "organizer-save", windowMs: 60_000, maxRequests: 120 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const json = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = await upsertOrganizerItem(parsed.data);
  logger.info("organizer.saved", { id: item.id, runId: item.runId, label: item.label });
  return NextResponse.json({ item });
}
