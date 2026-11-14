import { NextResponse } from "next/server";
import { z } from "zod";
import { startExtractionRun } from "@/lib/runner/playwright-runner";
import { createRun, listRuns } from "@/lib/runner/run-store";

const runInputSchema = z.object({
  targetUrl: z.string().url(),
  loginUrl: z.string().url().optional().or(z.literal("")),
  maxPages: z.number().int().positive().max(300).optional(),
  unlimitedPages: z.boolean().optional().default(false),
  maxDepth: z.number().int().positive().max(8).optional(),
  retryCount: z.number().int().nonnegative().max(5).optional()
});

export async function GET(): Promise<NextResponse> {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const parsed = runInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const run = await createRun({
    targetUrl: parsed.data.targetUrl,
    loginUrl: parsed.data.loginUrl || undefined,
    maxPages: parsed.data.maxPages,
    unlimitedPages: parsed.data.unlimitedPages ?? false,
    maxDepth: parsed.data.maxDepth,
    retryCount: parsed.data.retryCount
  });

  void startExtractionRun(run.id, {
    targetUrl: parsed.data.targetUrl,
    loginUrl: parsed.data.loginUrl || undefined,
    maxPages: parsed.data.maxPages,
    unlimitedPages: parsed.data.unlimitedPages ?? false,
    maxDepth: parsed.data.maxDepth,
    retryCount: parsed.data.retryCount
  });

  return NextResponse.json({ run }, { status: 201 });
}
