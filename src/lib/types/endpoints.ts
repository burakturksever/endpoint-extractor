export type EndpointSourceType = "network" | "static" | "promise";
export type EndpointConfidence = "high" | "medium" | "low";
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "UNKNOWN";

export interface EndpointRecord {
  id: string;
  runId: string;
  dedupeHash: string;
  originUrl: string;
  registrableDomain: string;
  pageUrl: string;
  sourceType: EndpointSourceType;
  confidence: EndpointConfidence;
  method: HttpMethod;
  rawExpression: string;
  resolvedUrl: string;
  inferredParams: string[];
  inferenceTrail: string;
  firstSeenAt: string;
  covered?: boolean;
  coveredAt?: string;
}

export interface RunConfig {
  targetUrl: string;
  loginUrl?: string;
  batchRunId?: string;
  originUrl?: string;
  allowedDomains?: string[];
  maxPages?: number;
  /** If true, use crawl-limits practical max instead of maxPages (policy + maxDepth still apply). */
  unlimitedPages?: boolean;
  maxDepth?: number;
  retryCount?: number;
}

export interface RunState {
  id: string;
  batchRunId?: string;
  targetUrl?: string;
  status: "pending_login" | "running" | "completed" | "failed";
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchRunState {
  id: string;
  status: "running" | "completed" | "failed";
  message: string;
  maxDepth: number;
  maxPages: number;
  unlimitedPages: boolean;
  concurrency: number;
  /** Short summary of seed URLs in this batch (for UI labels). */
  targetSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredDomainRecord {
  id: string;
  batchRunId: string;
  domain: string;
  sourceUrl: string;
  decision: "pending" | "approved" | "rejected";
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingsState {
  id: string;
  llmEnabled: boolean;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  hasLmStudioApiKey: boolean;
  updatedAt: string;
}

export interface EndpointClusterGroup {
  id: string;
  label: string;
  summary: string;
  /** Full rows from the clustering slice so the UI can select even when the main table is paginated. */
  members: EndpointRecord[];
}

export interface EndpointClusterMeta {
  endpointCount: number;
  totalInRun: number;
  truncated: boolean;
  cached?: boolean;
  endpointCountAtBuild?: number;
  savedAt?: string;
}

export interface EndpointClusterResponse {
  clusters: EndpointClusterGroup[];
  meta: EndpointClusterMeta;
  assignments?: EndpointClusterAssignment[];
}

export interface EndpointClusterAssignment {
  endpointId: string;
  primaryClusterId: string;
  secondaryTags: string[];
}

export interface GraphqlDetectionCandidate {
  endpointId: string;
  runId: string;
  url: string;
  method: HttpMethod | string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface GraphqlDetectionResponse {
  detected: boolean;
  candidates: GraphqlDetectionCandidate[];
}

export interface GraphqlSchemaSummary {
  queryType?: string;
  mutationType?: string;
  subscriptionType?: string;
  typeNames: string[];
}

export interface GraphqlEnumerationResponse {
  ok: boolean;
  endpointUrl: string;
  status?: number;
  durationMs: number;
  introspectionAvailable: boolean;
  typenameProbeOk: boolean;
  schema?: GraphqlSchemaSummary;
  errors: string[];
  responsePreview: string;
}

export type OrganizerLabel = "Finding" | "Potential Finding" | "Note";

export interface RepeaterRequestRecord {
  id: string;
  runId: string;
  endpointId?: string;
  method: HttpMethod | string;
  url: string;
  headers: string;
  body?: string;
  lastResponseStatus?: number;
  lastResponseHeaders?: string;
  lastResponseBody?: string;
  lastDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerItemRecord {
  id: string;
  runId: string;
  endpointId?: string;
  repeaterRequestId?: string;
  label: OrganizerLabel;
  description: string;
  createdAt: string;
  updatedAt: string;
}
