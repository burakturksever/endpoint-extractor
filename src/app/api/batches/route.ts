import { NextResponse } from "next/server";
import { z } from "zod";
import { startBatchRun } from "@/lib/runner/batch-orchestrator";
import { listBatchRuns } from "@/lib/runner/run-store";

const batchInputSchema = z.object({
  targetUrls: z.array(z.string().url()).min(1).max(200),
  loginUrl: z.string().url().optional().or(z.literal("")),
  maxPages: z.number().int().positive().max(300).optional(),
  unlimitedPages: z.boolean().optional().default(false),
  maxDepth: z.number().int().positive().max(8).optional(),
  retryCount: z.number().int().nonnegative().max(5).optional(),
  concurrency: z.number().int().positive().max(8).optional()
});

export async function GET(): Promise<NextResponse> {
  const batches = await listBatchRuns();
  return NextResponse.json({ batches });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const parsed = batchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await startBatchRun({
    targetUrls: parsed.data.targetUrls,
    loginUrl: parsed.data.loginUrl || undefined,
    maxPages: parsed.data.maxPages,
    unlimitedPages: parsed.data.unlimitedPages ?? false,
    maxDepth: parsed.data.maxDepth,
    retryCount: parsed.data.retryCount,
    concurrency: parsed.data.concurrency
  });

  return NextResponse.json(result, { status: 201 });
}
