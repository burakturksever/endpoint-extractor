import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/runs/[id]/cluster/route";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true }))
}));

vi.mock("@/lib/llm/endpoint-clustering", () => ({
  clusterEndpointsWithLlmDetailed: vi.fn()
}));

vi.mock("@/lib/llm/llm-errors", () => ({
  classifyLlmError: vi.fn(() => ({ code: "unknown", message: "failed" })),
  llmErrorHttpStatus: vi.fn(() => 500)
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}));

vi.mock("@/lib/runner/run-store", () => ({
  MAX_ENDPOINTS_FOR_CLUSTERING: 5000,
  clearRunClusterSnapshot: vi.fn(),
  getAppSettingsForLlm: vi.fn(),
  getRunClusterSnapshot: vi.fn(),
  listEndpointsForClustering: vi.fn(),
  runExists: vi.fn(),
  upsertRunClusterSnapshot: vi.fn()
}));

import { clusterEndpointsWithLlmDetailed } from "@/lib/llm/endpoint-clustering";
import {
  clearRunClusterSnapshot,
  getAppSettingsForLlm,
  getRunClusterSnapshot,
  listEndpointsForClustering,
  runExists,
  upsertRunClusterSnapshot
} from "@/lib/runner/run-store";

describe("POST /api/runs/[id]/cluster", () => {
  beforeEach(() => {
    vi.mocked(clusterEndpointsWithLlmDetailed).mockReset();
    vi.mocked(getAppSettingsForLlm).mockResolvedValue({
      llmEnabled: true,
      lmStudioBaseUrl: "http://127.0.0.1:1234/v1",
      lmStudioModel: "model",
      lmStudioApiKey: null
    });
    vi.mocked(runExists).mockResolvedValue(true);
    vi.mocked(listEndpointsForClustering).mockResolvedValue({
      endpoints: [
        {
          id: "e1",
          runId: "run-1",
          dedupeHash: "d1",
          originUrl: "https://example.com",
          registrableDomain: "example.com",
          pageUrl: "https://example.com/page",
          sourceType: "network",
          confidence: "high",
          method: "GET",
          rawExpression: "/api/users",
          resolvedUrl: "https://example.com/api/users",
          inferredParams: [],
          inferenceTrail: "",
          firstSeenAt: new Date().toISOString()
        }
      ],
      totalInRun: 1,
      appliedLimit: 5000
    });
    vi.mocked(getRunClusterSnapshot).mockResolvedValue(null);
    vi.mocked(clusterEndpointsWithLlmDetailed).mockResolvedValue({
      clusters: [{ id: "c1", label: "Users", summary: "", members: [] }],
      assignments: []
    });
    vi.mocked(clearRunClusterSnapshot).mockReset();
    vi.mocked(upsertRunClusterSnapshot).mockReset();
  });

  it("returns cached snapshot without recompute", async () => {
    vi.mocked(getRunClusterSnapshot).mockResolvedValue({
      runId: "run-1",
      clusters: [{ id: "cached", label: "Cached", summary: "", members: [] }],
      assignments: [],
      endpointCountAtBuild: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const response = await POST(new Request("http://localhost/api", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "run-1" })
    });
    const body = (await response.json()) as { meta: { cached?: boolean }; clusters: Array<{ id: string }> };
    expect(body.meta.cached).toBe(true);
    expect(body.clusters[0]?.id).toBe("cached");
    expect(clusterEndpointsWithLlmDetailed).not.toHaveBeenCalled();
  });

  it("force=true recomputes and overwrites snapshot", async () => {
    const response = await POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ force: true }) }), {
      params: Promise.resolve({ id: "run-1" })
    });
    const body = (await response.json()) as { meta: { cached?: boolean } };
    expect(clusterEndpointsWithLlmDetailed).toHaveBeenCalledTimes(1);
    expect(upsertRunClusterSnapshot).toHaveBeenCalledTimes(1);
    expect(body.meta.cached).toBe(false);
  });

  it("clears snapshot when run has no endpoints", async () => {
    vi.mocked(listEndpointsForClustering).mockResolvedValue({
      endpoints: [],
      totalInRun: 0,
      appliedLimit: 5000
    });
    const response = await POST(new Request("http://localhost/api", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "run-1" })
    });
    expect(response.status).toBe(200);
    expect(clearRunClusterSnapshot).toHaveBeenCalledWith("run-1");
    expect(clusterEndpointsWithLlmDetailed).not.toHaveBeenCalled();
  });
});
