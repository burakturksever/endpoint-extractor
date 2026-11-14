import { startExtractionRun } from "@/lib/runner/playwright-runner";
import { createBatchRun, createRun, updateBatchRun, upsertDiscoveredDomain } from "@/lib/runner/run-store";
import type { BatchRunState, RunState } from "@/lib/types/endpoints";

export interface StartBatchInput {
  targetUrls: string[];
  loginUrl?: string;
  maxPages?: number;
  unlimitedPages?: boolean;
  maxDepth?: number;
  retryCount?: number;
  concurrency?: number;
}

export interface BatchBootstrapResult {
  batch: BatchRunState;
  runs: RunState[];
}

export async function startBatchRun(input: StartBatchInput): Promise<BatchBootstrapResult> {
  const nominalMaxPages = Math.max(1, input.maxPages ?? 25);
  const unlimitedPages = input.unlimitedPages === true;
  const maxDepth = Math.max(1, input.maxDepth ?? 2);
  const concurrency = Math.min(8, Math.max(1, input.concurrency ?? 3));
  const retryCount = Math.max(0, input.retryCount ?? 1);
  const normalizedTargets = normalizeTargets(input.targetUrls);

  const batch = await createBatchRun({
    maxDepth,
    maxPages: nominalMaxPages,
    unlimitedPages,
    concurrency
  });

  const runs: RunState[] = [];
  for (const targetUrl of normalizedTargets) {
    runs.push(
      await createRun({
        batchRunId: batch.id,
        targetUrl,
        loginUrl: input.loginUrl,
        maxPages: nominalMaxPages,
        unlimitedPages,
        maxDepth,
        retryCount
      })
    );
  }

  void executeBatch(batch.id, runs, {
    targetUrls: input.targetUrls,
    loginUrl: input.loginUrl,
    maxPages: nominalMaxPages,
    unlimitedPages,
    maxDepth,
    concurrency,
    retryCount
  });

  return { batch, runs };
}

interface BatchExecutionInput {
  targetUrls: string[];
  loginUrl?: string;
  maxPages: number;
  unlimitedPages: boolean;
  maxDepth: number;
  concurrency: number;
  retryCount: number;
}

async function executeBatch(batchRunId: string, runs: RunState[], input: BatchExecutionInput): Promise<void> {
  try {
    await runWithConcurrency(
      runs,
      input.concurrency,
      async (run) => {
        await startExtractionRun(
          run.id,
          {
            targetUrl: run.targetUrl ?? "",
            loginUrl: input.loginUrl,
            maxPages: input.maxPages,
            unlimitedPages: input.unlimitedPages === true,
            maxDepth: input.maxDepth,
            retryCount: input.retryCount,
            batchRunId
          },
          {
            onDiscoveredDomain: async ({ domain, sourceUrl }) => {
              await upsertDiscoveredDomain({
                batchRunId,
                domain,
                sourceUrl
              });
            }
          }
        );
      }
    );
    await updateBatchRun(batchRunId, "completed", "Batch completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch failed.";
    await updateBatchRun(batchRunId, "failed", message);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await work(current);
    }
  });
  await Promise.all(workers);
}

function normalizeTargets(targetUrls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of targetUrls) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const url = new URL(trimmed);
      const normalized = url.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    } catch {
      // Skip invalid URLs; API layer should validate, this is a safety net.
    }
  }
  return out;
}
