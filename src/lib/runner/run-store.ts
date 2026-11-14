import { EventEmitter } from "node:events";
import { prisma } from "@/lib/db";
import type {
  AppSettingsState,
  BatchRunState,
  DiscoveredDomainRecord,
  EndpointClusterAssignment,
  EndpointClusterGroup,
  EndpointRecord,
  OrganizerItemRecord,
  OrganizerLabel,
  RepeaterRequestRecord,
  RunConfig,
  RunState
} from "@/lib/types/endpoints";
import { batchTargetSummary } from "@/lib/ui/format-seed-url";

interface RunChannel {
  emitter: EventEmitter;
}

const channels = new Map<string, RunChannel>();

const persistedEndpointKeys = new Set<string>();
const MAX_ENDPOINT_DEDUPE_KEYS = 200_000;
let sqliteMutationQueue: Promise<void> = Promise.resolve();

function runSqliteMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = sqliteMutationQueue.then(() => task(), () => task());
  sqliteMutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function rememberEndpointKey(key: string): void {
  persistedEndpointKeys.add(key);
  if (persistedEndpointKeys.size > MAX_ENDPOINT_DEDUPE_KEYS) {
    persistedEndpointKeys.clear();
  }
}

export async function createRun(config: RunConfig): Promise<RunState> {
  const run = await prisma.run.create({
    data: {
      batchRunId: config.batchRunId,
      targetUrl: config.targetUrl,
      loginUrl: config.loginUrl,
      status: config.loginUrl ? "pending_login" : "running",
      message: config.loginUrl ? "Waiting for user login." : "Run started."
    }
  });
  channels.set(run.id, { emitter: new EventEmitter() });
  return serializeRun(run);
}

export function getRunChannel(runId: string): EventEmitter {
  if (!channels.has(runId)) {
    channels.set(runId, { emitter: new EventEmitter() });
  }
  return channels.get(runId)!.emitter;
}

export async function updateRun(runId: string, status: RunState["status"], message: string): Promise<void> {
  const run = await prisma.run.update({
    where: { id: runId },
    data: { status, message }
  });
  getRunChannel(runId).emit("run", serializeRun(run));
}

export function saveEndpoint(endpoint: EndpointRecord): Promise<void> {
  const key = `${endpoint.runId}:${endpoint.dedupeHash}`;
  return runSqliteMutation(async () => {
    if (persistedEndpointKeys.has(key)) {
      return;
    }
    const existing = await prisma.endpoint.findUnique({
      where: {
        runId_dedupeHash: {
          runId: endpoint.runId,
          dedupeHash: endpoint.dedupeHash
        }
      }
    });
    const saved = existing
      ? await prisma.endpoint.update({
          where: { id: existing.id },
          data: buildEndpointUpdate(existing, endpoint)
        })
      : await prisma.endpoint.create({
          data: {
            id: endpoint.id,
            runId: endpoint.runId,
            dedupeHash: endpoint.dedupeHash,
            originUrl: endpoint.originUrl,
            registrableDomain: endpoint.registrableDomain,
            pageUrl: endpoint.pageUrl,
            sourceType: endpoint.sourceType,
            confidence: endpoint.confidence,
            method: endpoint.method,
            rawExpression: endpoint.rawExpression,
            resolvedUrl: endpoint.resolvedUrl,
            inferredParams: JSON.stringify(endpoint.inferredParams),
            inferenceTrail: endpoint.inferenceTrail,
            firstSeenAt: new Date(endpoint.firstSeenAt)
          }
        });
    rememberEndpointKey(key);
    if (!existing && saved.id === endpoint.id) {
      getRunChannel(endpoint.runId).emit("endpoint", endpoint);
    }
  });
}

export function buildEndpointUpdate(
  existing: {
    sourceType: string;
    confidence: string;
    rawExpression: string;
    resolvedUrl: string;
    inferredParams: string;
    inferenceTrail: string;
  },
  incoming: EndpointRecord
): {
  sourceType: string;
  confidence: string;
  rawExpression: string;
  resolvedUrl: string;
  inferredParams: string;
  inferenceTrail: string;
} {
  const mergedParams = mergeParamNames(parseParams(existing.inferredParams), incoming.inferredParams);
  const keepIncoming = shouldPreferIncomingSnapshot(
    {
      sourceType: existing.sourceType,
      confidence: existing.confidence,
      rawExpression: existing.rawExpression
    },
    incoming
  );
  if (keepIncoming) {
    return {
      sourceType: incoming.sourceType,
      confidence: incoming.confidence,
      rawExpression: incoming.rawExpression,
      resolvedUrl: incoming.resolvedUrl,
      inferredParams: JSON.stringify(mergedParams),
      inferenceTrail: incoming.inferenceTrail
    };
  }
  return {
    sourceType: existing.sourceType,
    confidence: existing.confidence,
    rawExpression: existing.rawExpression,
    resolvedUrl: existing.resolvedUrl,
    inferredParams: JSON.stringify(mergedParams),
    inferenceTrail: existing.inferenceTrail
  };
}

export function shouldPreferIncomingSnapshot(
  existing: { sourceType: string; confidence: string; rawExpression: string },
  incoming: { sourceType: string; confidence: string; rawExpression: string }
): boolean {
  if (incoming.confidence === "high" && existing.confidence !== "high") {
    return true;
  }
  if (existing.confidence === "high" && incoming.confidence !== "high") {
    return false;
  }
  return snapshotQualityScore(incoming) > snapshotQualityScore(existing);
}

function snapshotQualityScore(input: { sourceType: string; confidence: string; rawExpression: string }): number {
  const confidenceWeight = input.confidence === "high" ? 300 : input.confidence === "medium" ? 200 : 100;
  const sourceWeight = input.sourceType === "network" ? 40 : input.sourceType === "static" ? 25 : 5;
  const noisyPromiseLikePenalty =
    input.confidence === "medium" && /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\.\s*get\s*\(/i.test(input.rawExpression) ? 90 : 0;
  const lowStaticBonus = input.confidence === "low" && input.sourceType === "static" ? 35 : 0;
  return confidenceWeight + sourceWeight + lowStaticBonus - noisyPromiseLikePenalty;
}

function mergeParamNames(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b].filter((x) => x.trim().length > 0))).sort();
}

export async function listRuns(): Promise<RunState[]> {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" }
  });
  return runs.map(serializeRun);
}

export async function createBatchRun(config: {
  maxDepth: number;
  maxPages: number;
  unlimitedPages?: boolean;
  concurrency: number;
}): Promise<BatchRunState> {
  const batch = await prisma.batchRun.create({
    data: {
      status: "running",
      message: "Batch started.",
      maxDepth: config.maxDepth,
      maxPages: config.maxPages,
      unlimitedPages: config.unlimitedPages ?? false,
      concurrency: config.concurrency
    }
  });
  return serializeBatchRun(batch);
}

export async function listBatchRuns(): Promise<BatchRunState[]> {
  const rows = await prisma.batchRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { createdAt: "asc" },
        select: { targetUrl: true }
      }
    }
  });
  return rows.map(serializeBatchRun);
}

export async function updateBatchRun(
  batchRunId: string,
  status: BatchRunState["status"],
  message: string
): Promise<BatchRunState> {
  const batch = await prisma.batchRun.update({
    where: { id: batchRunId },
    data: { status, message }
  });
  return serializeBatchRun(batch);
}

export async function upsertDiscoveredDomain(input: {
  batchRunId: string;
  domain: string;
  sourceUrl: string;
  decision?: DiscoveredDomainRecord["decision"];
  reason?: string;
}): Promise<DiscoveredDomainRecord> {
  const normalizedDomain = input.domain.toLowerCase();
  const remembered = await prisma.domainDecisionMemory.findUnique({
    where: { domain: normalizedDomain }
  });
  const preferredDecision =
    remembered?.decision === "approved" || remembered?.decision === "rejected"
      ? (remembered.decision as DiscoveredDomainRecord["decision"])
      : undefined;
  const finalDecision = input.decision ?? preferredDecision ?? "pending";
  const finalReason = input.reason ?? remembered?.reason ?? null;

  const row = await prisma.discoveredDomain.upsert({
    where: {
      batchRunId_domain: {
        batchRunId: input.batchRunId,
        domain: normalizedDomain
      }
    },
    update: {
      sourceUrl: input.sourceUrl,
      decision: finalDecision,
      reason: finalReason
    },
    create: {
      batchRunId: input.batchRunId,
      domain: normalizedDomain,
      sourceUrl: input.sourceUrl,
      decision: finalDecision,
      reason: finalReason
    }
  });
  return serializeDiscoveredDomain(row);
}

export async function updateDiscoveredDomainDecision(input: {
  batchRunId: string;
  domain: string;
  decision: "approved" | "rejected";
  reason?: string;
}): Promise<DiscoveredDomainRecord> {
  const normalizedDomain = input.domain.toLowerCase();
  const row = await prisma.discoveredDomain.update({
    where: {
      batchRunId_domain: {
        batchRunId: input.batchRunId,
        domain: normalizedDomain
      }
    },
    data: {
      decision: input.decision,
      reason: input.reason ?? null
    }
  });
  await prisma.domainDecisionMemory.upsert({
    where: { domain: normalizedDomain },
    create: {
      domain: normalizedDomain,
      decision: input.decision,
      reason: input.reason ?? null
    },
    update: {
      decision: input.decision,
      reason: input.reason ?? null
    }
  });
  return serializeDiscoveredDomain(row);
}

export async function listDiscoveredDomains(batchRunId: string): Promise<DiscoveredDomainRecord[]> {
  const rows = await prisma.discoveredDomain.findMany({
    where: { batchRunId },
    orderBy: { createdAt: "asc" }
  });
  return rows.map(serializeDiscoveredDomain);
}

/** Hard cap for LLM clustering endpoint reads per run (processing may still be chunked before model calls). */
export const MAX_ENDPOINTS_FOR_CLUSTERING = 5000;

export async function getRunWithEndpoints(
  runId: string,
  options?: { endpointPage?: number; endpointPageSize?: number }
): Promise<{ run: RunState; endpoints: EndpointRecord[] } | null> {
  const endpointPage = Math.max(1, options?.endpointPage ?? 1);
  const endpointPageSize = Math.min(300, Math.max(20, options?.endpointPageSize ?? 200));
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      endpoints: {
        orderBy: { firstSeenAt: "asc" },
        skip: (endpointPage - 1) * endpointPageSize,
        take: endpointPageSize
      }
    }
  });
  if (!run) {
    return null;
  }
  return {
    run: serializeRun(run),
    endpoints: run.endpoints.map(endpointFromPrisma)
  };
}

export async function runExists(runId: string): Promise<boolean> {
  const row = await prisma.run.findUnique({ where: { id: runId }, select: { id: true } });
  return row !== null;
}

export async function listEndpointsForClustering(
  runId: string,
  requestedLimit?: number
): Promise<{ endpoints: EndpointRecord[]; totalInRun: number; appliedLimit: number }> {
  const totalInRun = await prisma.endpoint.count({ where: { runId } });
  const appliedLimit = Math.min(
    Math.max(1, requestedLimit ?? MAX_ENDPOINTS_FOR_CLUSTERING),
    MAX_ENDPOINTS_FOR_CLUSTERING
  );
  const rows = await prisma.endpoint.findMany({
    where: { runId },
    orderBy: { firstSeenAt: "asc" },
    take: appliedLimit
  });
  return {
    endpoints: rows.map(endpointFromPrisma),
    totalInRun,
    appliedLimit
  };
}

export async function getRunClusterSnapshot(runId: string): Promise<{
  runId: string;
  clusters: EndpointClusterGroup[];
  assignments: EndpointClusterAssignment[];
  endpointCountAtBuild: number;
  createdAt: string;
  updatedAt: string;
} | null> {
  const row = await prisma.runClusterSnapshot.findUnique({ where: { runId } });
  if (!row) {
    return null;
  }
  try {
    const clusters = JSON.parse(row.clustersJson) as EndpointClusterGroup[];
    const assignments = JSON.parse(row.assignmentsJson) as EndpointClusterAssignment[];
    return {
      runId: row.runId,
      clusters,
      assignments,
      endpointCountAtBuild: row.endpointCountAtBuild,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  } catch {
    return null;
  }
}

export async function upsertRunClusterSnapshot(input: {
  runId: string;
  clusters: EndpointClusterGroup[];
  assignments: EndpointClusterAssignment[];
  endpointCountAtBuild: number;
}): Promise<void> {
  await prisma.runClusterSnapshot.upsert({
    where: { runId: input.runId },
    create: {
      runId: input.runId,
      clustersJson: JSON.stringify(input.clusters),
      assignmentsJson: JSON.stringify(input.assignments),
      endpointCountAtBuild: input.endpointCountAtBuild
    },
    update: {
      clustersJson: JSON.stringify(input.clusters),
      assignmentsJson: JSON.stringify(input.assignments),
      endpointCountAtBuild: input.endpointCountAtBuild
    }
  });
}

export async function clearRunClusterSnapshot(runId: string): Promise<void> {
  await prisma.runClusterSnapshot.delete({ where: { runId } }).catch(() => undefined);
}

export async function listEndpointsByIds(endpointIds: string[]): Promise<EndpointRecord[]> {
  if (endpointIds.length === 0) {
    return [];
  }
  const rows = await prisma.endpoint.findMany({
    where: { id: { in: endpointIds } }
  });
  const byId = new Map(rows.map((row) => [row.id, endpointFromPrisma(row)]));
  const ordered: EndpointRecord[] = [];
  for (const id of endpointIds) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
    }
  }
  return ordered;
}

const APP_SETTINGS_ID = "default";

export async function getAppSettings(): Promise<AppSettingsState> {
  const row = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID },
    update: {}
  });
  return serializeAppSettings(row);
}

export async function getAppSettingsForLlm(): Promise<{
  llmEnabled: boolean;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  lmStudioApiKey: string | null;
}> {
  const row = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID },
    update: {}
  });
  const envBase = process.env.LM_STUDIO_BASE_URL?.trim();
  return {
    llmEnabled: row.llmEnabled,
    lmStudioBaseUrl: envBase && envBase.length > 0 ? envBase : row.lmStudioBaseUrl,
    lmStudioModel: row.lmStudioModel,
    lmStudioApiKey: row.lmStudioApiKey
  };
}

export async function patchAppSettings(input: {
  llmEnabled?: boolean;
  lmStudioBaseUrl?: string;
  lmStudioModel?: string;
  lmStudioApiKey?: string | null;
}): Promise<AppSettingsState> {
  const update: {
    llmEnabled?: boolean;
    lmStudioBaseUrl?: string;
    lmStudioModel?: string;
    lmStudioApiKey?: string | null;
  } = {};
  if (input.llmEnabled !== undefined) {
    update.llmEnabled = input.llmEnabled;
  }
  if (input.lmStudioBaseUrl !== undefined) {
    update.lmStudioBaseUrl = input.lmStudioBaseUrl;
  }
  if (input.lmStudioModel !== undefined) {
    update.lmStudioModel = input.lmStudioModel;
  }
  if (input.lmStudioApiKey !== undefined) {
    update.lmStudioApiKey = input.lmStudioApiKey;
  }
  if (Object.keys(update).length === 0) {
    return getAppSettings();
  }
  const row = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      llmEnabled: input.llmEnabled ?? false,
      lmStudioBaseUrl: input.lmStudioBaseUrl ?? "http://127.0.0.1:1234/v1",
      lmStudioModel: input.lmStudioModel ?? "qwen2.5-7b-instruct",
      lmStudioApiKey: input.lmStudioApiKey === undefined ? null : input.lmStudioApiKey
    },
    update
  });
  return serializeAppSettings(row);
}

export async function getEndpointForRun(runId: string, endpointId: string): Promise<EndpointRecord | null> {
  const item = await prisma.endpoint.findFirst({
    where: { id: endpointId, runId }
  });
  if (!item) {
    return null;
  }
  return endpointFromPrisma(item);
}

export async function setEndpointCoverage(input: {
  endpointId: string;
  covered: boolean;
}): Promise<EndpointRecord | null> {
  const row = await prisma.endpoint.update({
    where: { id: input.endpointId },
    data: {
      covered: input.covered,
      coveredAt: input.covered ? new Date() : null
    }
  }).catch(() => null);
  return row ? endpointFromPrisma(row) : null;
}

export async function upsertRepeaterRequest(input: {
  id?: string;
  runId: string;
  endpointId?: string;
  method: string;
  url: string;
  headers: string;
  body?: string;
}): Promise<RepeaterRequestRecord> {
  const row = input.id
    ? await prisma.repeaterRequest.update({
        where: { id: input.id },
        data: {
          runId: input.runId,
          endpointId: input.endpointId ?? null,
          method: input.method,
          url: input.url,
          headers: input.headers,
          body: input.body ?? null
        }
      })
    : await prisma.repeaterRequest.create({
        data: {
          runId: input.runId,
          endpointId: input.endpointId ?? null,
          method: input.method,
          url: input.url,
          headers: input.headers,
          body: input.body ?? null
        }
      });
  return serializeRepeaterRequest(row);
}

export async function saveRepeaterResponse(input: {
  id: string;
  status: number;
  headers: string;
  body: string;
  durationMs: number;
}): Promise<RepeaterRequestRecord | null> {
  const row = await prisma.repeaterRequest
    .update({
      where: { id: input.id },
      data: {
        lastResponseStatus: input.status,
        lastResponseHeaders: input.headers,
        lastResponseBody: input.body,
        lastDurationMs: input.durationMs
      }
    })
    .catch(() => null);
  return row ? serializeRepeaterRequest(row) : null;
}

export async function listRepeaterRequests(input?: {
  runId?: string;
  endpointId?: string;
}): Promise<RepeaterRequestRecord[]> {
  const rows = await prisma.repeaterRequest.findMany({
    where: {
      ...(input?.runId ? { runId: input.runId } : {}),
      ...(input?.endpointId ? { endpointId: input.endpointId } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: 300
  });
  return rows.map(serializeRepeaterRequest);
}

export async function upsertOrganizerItem(input: {
  id?: string;
  runId: string;
  endpointId?: string;
  repeaterRequestId?: string;
  label: OrganizerLabel;
  description: string;
}): Promise<OrganizerItemRecord> {
  const row = input.id
    ? await prisma.organizerItem.update({
        where: { id: input.id },
        data: {
          runId: input.runId,
          endpointId: input.endpointId ?? null,
          repeaterRequestId: input.repeaterRequestId ?? null,
          label: input.label,
          description: input.description
        }
      })
    : await prisma.organizerItem.create({
        data: {
          runId: input.runId,
          endpointId: input.endpointId ?? null,
          repeaterRequestId: input.repeaterRequestId ?? null,
          label: input.label,
          description: input.description
        }
      });
  return serializeOrganizerItem(row);
}

export async function listOrganizerItems(input?: {
  runId?: string;
  label?: OrganizerLabel;
}): Promise<OrganizerItemRecord[]> {
  const rows = await prisma.organizerItem.findMany({
    where: {
      ...(input?.runId ? { runId: input.runId } : {}),
      ...(input?.label ? { label: input.label } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: 500
  });
  return rows.map(serializeOrganizerItem);
}

function endpointFromPrisma(item: {
  id: string;
  runId: string;
  dedupeHash: string;
  originUrl: string;
  registrableDomain: string;
  pageUrl: string;
  sourceType: string;
  confidence: string;
  method: string;
  rawExpression: string;
  resolvedUrl: string;
  inferredParams: string;
  inferenceTrail: string;
  firstSeenAt: Date;
  covered?: boolean;
  coveredAt?: Date | null;
}): EndpointRecord {
  return {
    id: item.id,
    runId: item.runId,
    dedupeHash: item.dedupeHash,
    originUrl: item.originUrl,
    registrableDomain: item.registrableDomain,
    pageUrl: item.pageUrl,
    sourceType: item.sourceType as EndpointRecord["sourceType"],
    confidence: item.confidence as EndpointRecord["confidence"],
    method: item.method as EndpointRecord["method"],
    rawExpression: item.rawExpression,
    resolvedUrl: item.resolvedUrl,
    inferredParams: parseParams(item.inferredParams),
    inferenceTrail: item.inferenceTrail,
    firstSeenAt: item.firstSeenAt.toISOString(),
    covered: Boolean(item.covered),
    coveredAt: item.coveredAt ? item.coveredAt.toISOString() : undefined
  };
}

function serializeRepeaterRequest(row: {
  id: string;
  runId: string;
  endpointId: string | null;
  method: string;
  url: string;
  headers: string;
  body: string | null;
  lastResponseStatus: number | null;
  lastResponseHeaders: string | null;
  lastResponseBody: string | null;
  lastDurationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}): RepeaterRequestRecord {
  return {
    id: row.id,
    runId: row.runId,
    endpointId: row.endpointId ?? undefined,
    method: row.method,
    url: row.url,
    headers: row.headers,
    body: row.body ?? undefined,
    lastResponseStatus: row.lastResponseStatus ?? undefined,
    lastResponseHeaders: row.lastResponseHeaders ?? undefined,
    lastResponseBody: row.lastResponseBody ?? undefined,
    lastDurationMs: row.lastDurationMs ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeOrganizerItem(row: {
  id: string;
  runId: string;
  endpointId: string | null;
  repeaterRequestId: string | null;
  label: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}): OrganizerItemRecord {
  return {
    id: row.id,
    runId: row.runId,
    endpointId: row.endpointId ?? undefined,
    repeaterRequestId: row.repeaterRequestId ?? undefined,
    label: row.label as OrganizerLabel,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeAppSettings(row: {
  id: string;
  llmEnabled: boolean;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  lmStudioApiKey: string | null;
  updatedAt: Date;
}): AppSettingsState {
  return {
    id: row.id,
    llmEnabled: row.llmEnabled,
    lmStudioBaseUrl: row.lmStudioBaseUrl,
    lmStudioModel: row.lmStudioModel,
    hasLmStudioApiKey: Boolean(row.lmStudioApiKey && row.lmStudioApiKey.length > 0),
    updatedAt: row.updatedAt.toISOString()
  };
}

function serializeRun(run: {
  id: string;
  batchRunId: string | null;
  targetUrl: string;
  status: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}): RunState {
  return {
    id: run.id,
    batchRunId: run.batchRunId ?? undefined,
    targetUrl: run.targetUrl,
    status: run.status as RunState["status"],
    message: run.message,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}

export async function getBatchWithRuns(batchRunId: string): Promise<{
  batch: BatchRunState;
  runs: RunState[];
  domains: DiscoveredDomainRecord[];
} | null> {
  const batch = await prisma.batchRun.findUnique({
    where: { id: batchRunId },
    include: {
      runs: {
        orderBy: { createdAt: "asc" }
      },
      domains: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!batch) {
    return null;
  }
  return {
    batch: serializeBatchRun(batch),
    runs: batch.runs.map(serializeRun),
    domains: batch.domains.map(serializeDiscoveredDomain)
  };
}

function serializeBatchRun(value: {
  id: string;
  status: string;
  message: string;
  maxDepth: number;
  maxPages: number;
  unlimitedPages: boolean;
  concurrency: number;
  createdAt: Date;
  updatedAt: Date;
  runs?: { targetUrl: string }[];
}): BatchRunState {
  const urls = value.runs?.map((r) => r.targetUrl) ?? [];
  return {
    id: value.id,
    status: value.status as BatchRunState["status"],
    message: value.message,
    maxDepth: value.maxDepth,
    maxPages: value.maxPages,
    unlimitedPages: value.unlimitedPages,
    concurrency: value.concurrency,
    targetSummary: urls.length > 0 ? batchTargetSummary(urls) : undefined,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString()
  };
}

function serializeDiscoveredDomain(value: {
  id: string;
  batchRunId: string;
  domain: string;
  sourceUrl: string;
  decision: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DiscoveredDomainRecord {
  return {
    id: value.id,
    batchRunId: value.batchRunId,
    domain: value.domain,
    sourceUrl: value.sourceUrl,
    decision: value.decision as DiscoveredDomainRecord["decision"],
    reason: value.reason ?? undefined,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString()
  };
}

function parseParams(value: string): string[] {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}
