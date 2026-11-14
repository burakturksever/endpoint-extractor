import { lmStudioChatJson } from "@/lib/llm/lm-studio-client";
import type { EndpointClusterAssignment, EndpointClusterGroup, EndpointRecord } from "@/lib/types/endpoints";

export const CLUSTER_RESOLVED_URL_MAX = 160;
export const MAX_LLM_CLUSTERS = 25;
const LLM_CHUNK_SIZE = 160;
const MIN_CHUNK_SIZE = 35;
const CLUSTER_TIMEOUT_MS = 300_000;

export function truncateForClusterUrl(url: string, max = CLUSTER_RESOLVED_URL_MAX): string {
  const t = url.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

interface LlmClusterRow {
  id?: string;
  label?: string;
  summary?: string;
  endpointIds?: unknown;
}

interface LlmClusterPayload {
  clusters?: unknown;
}

function createMiscCluster(members: EndpointRecord[], summary: string): EndpointClusterGroup | null {
  if (members.length === 0) {
    return null;
  }
  return {
    id: "miscellaneous",
    label: "Miscellaneous",
    summary,
    members
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][];
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function shouldExcludeFromLlmClustering(endpoint: EndpointRecord): boolean {
  const url = endpoint.resolvedUrl.toLowerCase();
  const host = safeHostname(url);
  const pathname = safePathname(url);

  const noisyHosts = [
    "zendesk.com",
    "help.",
    "support.",
    "facebook.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "cdn.",
    "static."
  ];
  if (noisyHosts.some((part) => host.includes(part))) {
    return true;
  }

  const noisyPathParts = [
    "/static/",
    "/assets/",
    "/widget/",
    "/widgets/",
    "/help/",
    "/support/",
    "/articles/",
    "/hc/",
    "/knowledge",
    "/faq",
    "/share/",
    "/social/"
  ];
  if (noisyPathParts.some((part) => pathname.includes(part))) {
    return true;
  }

  if (/\.(?:css|js|map|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|pdf|txt|xml)(?:$|\?)/.test(url)) {
    return true;
  }

  return false;
}

function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function safePathname(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

function dedupeMembersById(members: EndpointRecord[]): EndpointRecord[] {
  const seen = new Set<string>();
  const deduped: EndpointRecord[] = [];
  for (const member of members) {
    if (seen.has(member.id)) {
      continue;
    }
    seen.add(member.id);
    deduped.push(member);
  }
  return deduped;
}

function mergeClustersByLabel(clusters: EndpointClusterGroup[]): EndpointClusterGroup[] {
  const byLabel = new Map<string, EndpointClusterGroup>();
  for (const cluster of clusters) {
    if (cluster.id === "unclustered") {
      continue;
    }
    const key = cluster.label.trim().toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, {
        id: key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cluster",
        label: cluster.label,
        summary: cluster.summary,
        members: [...cluster.members]
      });
      continue;
    }
    existing.members.push(...cluster.members);
    if (!existing.summary && cluster.summary) {
      existing.summary = cluster.summary;
    }
  }
  return Array.from(byLabel.values()).map((cluster) => ({
    ...cluster,
    members: dedupeMembersById(cluster.members)
  }));
}

function isRetriableChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes("invalid json") ||
    msg.includes("truncated") ||
    msg.includes("timed out") ||
    msg.includes("abort")
  );
}

async function clusterChunkWithRetry(chunk: EndpointRecord[]): Promise<EndpointClusterGroup[]> {
  const schema = '{"clusters":[{"id":"string","label":"string","summary":"string","endpointIds":["endpoint_id"]}]}';
  const rows = chunk.map((e) => ({
    id: e.id,
    method: e.method,
    url: truncateForClusterUrl(e.resolvedUrl),
    source: e.sourceType,
    confidence: e.confidence
  }));

  try {
    const parsed = await lmStudioChatJson<LlmClusterPayload>(
      "You group HTTP endpoints from a security/recon crawl into concise, human-readable product/feature clusters. Do not create static/support/social clusters; keep those for a generic miscellaneous bucket. Output JSON only and only include endpoint ids from the provided rows.",
      `Group these endpoints into at most ${MAX_LLM_CLUSTERS} clusters. Use only the listed ids in endpointIds.\n${JSON.stringify(rows)}`,
      schema,
      4096,
      CLUSTER_TIMEOUT_MS
    );
    return normalizeClustersFromLlm(parsed, chunk);
  } catch (error) {
    if (!isRetriableChunkError(error) || chunk.length <= MIN_CHUNK_SIZE) {
      throw error;
    }
    const splitAt = Math.ceil(chunk.length / 2);
    const left = await clusterChunkWithRetry(chunk.slice(0, splitAt));
    const right = await clusterChunkWithRetry(chunk.slice(splitAt));
    return [...left, ...right];
  }
}

/**
 * Overlap rule: clusters are applied in array order; the first cluster to claim an endpoint id wins.
 * Later references to the same id are ignored. Unassigned ids become a synthetic "Unclustered" group.
 */
export function normalizeClustersFromLlm(raw: unknown, endpoints: EndpointRecord[]): EndpointClusterGroup[] {
  const clustersRaw = (raw as LlmClusterPayload).clusters;
  if (!Array.isArray(clustersRaw)) {
    if (endpoints.length === 0) {
      return [];
    }
    return [
      {
        id: "unclustered",
        label: "Unclustered",
        summary: "Model returned no usable cluster list; all endpoints are grouped here.",
        members: [...endpoints]
      }
    ];
  }
  const rows = clustersRaw.slice(0, MAX_LLM_CLUSTERS) as LlmClusterRow[];
  const byId = new Map(endpoints.map((e) => [e.id, e]));
  const referenced = new Set<string>();
  const out: EndpointClusterGroup[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : `Cluster ${i + 1}`;
    const summary = typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : "";
    const cid = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `cluster-${i + 1}`;
    const idsRaw = Array.isArray(row.endpointIds) ? row.endpointIds : [];
    const members: EndpointRecord[] = [];
    for (const id of idsRaw) {
      if (typeof id !== "string" || !byId.has(id)) {
        continue;
      }
      referenced.add(id);
      members.push(byId.get(id)!);
    }
    if (members.length > 0) {
      out.push({ id: cid, label, summary, members });
    }
  }

  const unassigned: EndpointRecord[] = [];
  for (const ep of endpoints) {
    if (!referenced.has(ep.id)) {
      unassigned.push(ep);
    }
  }
  if (unassigned.length > 0) {
    out.push({
      id: "unclustered",
      label: "Unclustered",
      summary: "Endpoints not placed in any model cluster (overlap drops, invalid ids, or model omission).",
      members: unassigned
    });
  }

  return out;
}

function dedupeClustersWithSecondaryTags(input: EndpointClusterGroup[]): {
  clusters: EndpointClusterGroup[];
  assignments: EndpointClusterAssignment[];
} {
  const assignmentByEndpoint = new Map<string, EndpointClusterAssignment>();
  const clusterMap = new Map<string, EndpointClusterGroup>();

  for (const cluster of input) {
    clusterMap.set(cluster.id, {
      ...cluster,
      members: []
    });
  }

  for (const cluster of input) {
    const targetCluster = clusterMap.get(cluster.id);
    if (!targetCluster) continue;
    for (const member of cluster.members) {
      const existing = assignmentByEndpoint.get(member.id);
      if (!existing) {
        assignmentByEndpoint.set(member.id, {
          endpointId: member.id,
          primaryClusterId: cluster.id,
          secondaryTags: []
        });
        targetCluster.members.push(member);
        continue;
      }
      if (existing.primaryClusterId !== cluster.id && !existing.secondaryTags.includes(cluster.label)) {
        existing.secondaryTags.push(cluster.label);
      }
    }
  }

  const clusters = input
    .map((cluster) => clusterMap.get(cluster.id)!)
    .filter((cluster) => cluster.members.length > 0);

  const assignments = Array.from(assignmentByEndpoint.values()).sort((a, b) => a.endpointId.localeCompare(b.endpointId));
  return { clusters, assignments };
}

export async function clusterEndpointsWithLlmDetailed(endpoints: EndpointRecord[]): Promise<{
  clusters: EndpointClusterGroup[];
  assignments: EndpointClusterAssignment[];
}> {
  if (endpoints.length === 0) {
    return { clusters: [], assignments: [] };
  }

  const llmCandidates: EndpointRecord[] = [];
  const excludedNoise: EndpointRecord[] = [];
  for (const endpoint of endpoints) {
    if (shouldExcludeFromLlmClustering(endpoint)) {
      excludedNoise.push(endpoint);
    } else {
      llmCandidates.push(endpoint);
    }
  }

  const chunks = chunkArray(llmCandidates, LLM_CHUNK_SIZE);
  const combinedClusters: EndpointClusterGroup[] = [];
  const combinedUnclustered: EndpointRecord[] = [];

  for (const chunk of chunks) {
    const normalized = await clusterChunkWithRetry(chunk);
    for (const cluster of normalized) {
      if (cluster.id === "unclustered") {
        combinedUnclustered.push(...cluster.members);
      } else {
        combinedClusters.push(cluster);
      }
    }
  }

  const merged = mergeClustersByLabel(combinedClusters);
  const unclustered = createMiscCluster(
    dedupeMembersById(combinedUnclustered),
    "Non-noisy endpoints the model did not place in a specific group."
  );
  const miscellaneous = createMiscCluster(
    excludedNoise,
    "Static/support/social/help-style endpoints excluded from model clustering by heuristics."
  );

  const out = [...merged];
  if (unclustered) {
    out.push({ ...unclustered, id: "unclustered", label: "Unclustered" });
  }
  if (miscellaneous) {
    out.push(miscellaneous);
  }
  return dedupeClustersWithSecondaryTags(out);
}

export async function clusterEndpointsWithLlm(endpoints: EndpointRecord[]): Promise<EndpointClusterGroup[]> {
  const result = await clusterEndpointsWithLlmDetailed(endpoints);
  return result.clusters;
}
