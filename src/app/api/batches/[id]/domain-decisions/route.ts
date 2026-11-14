import { NextResponse } from "next/server";
import { z } from "zod";
import { listDiscoveredDomains, updateDiscoveredDomainDecision } from "@/lib/runner/run-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const decisionSchema = z.object({
  domain: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().optional()
});

export async function GET(_: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const domains = await listDiscoveredDomains(id);
  return NextResponse.json({ domains });
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateDiscoveredDomainDecision({
    batchRunId: id,
    domain: parsed.data.domain.toLowerCase(),
    decision: parsed.data.decision,
    reason: parsed.data.reason
  });
  return NextResponse.json({ domain: updated });
}
