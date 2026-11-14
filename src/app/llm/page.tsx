"use client";

import { useEffect, useMemo, useState } from "react";
import { EndpointDetailDrawer } from "@/components/endpoint-detail-drawer";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { getWorkflowSelection, setWorkflowSelection } from "@/lib/client/workflow-selection";
import type { EndpointClusterResponse, EndpointRecord, RunState } from "@/lib/types/endpoints";

export default function LlmPage(): React.ReactElement {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [clusterData, setClusterData] = useState<EndpointClusterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointRecord | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/runs");
      const data = (await response.json()) as { runs: RunState[] };
      setRuns(data.runs);
      const wf = getWorkflowSelection();
      if (wf?.runId && data.runs.some((r) => r.id === wf.runId)) {
        setRunId(wf.runId);
      }
    })();
  }, []);

  const endpointsById = useMemo(() => {
    const map = new Map<string, EndpointRecord>();
    for (const cluster of clusterData?.clusters ?? []) {
      for (const member of cluster.members) {
        map.set(member.id, member);
      }
    }
    return map;
  }, [clusterData]);

  const activeCluster = useMemo(
    () => clusterData?.clusters.find((c) => c.id === selectedClusterId) ?? clusterData?.clusters[0] ?? null,
    [clusterData, selectedClusterId]
  );

  const listedAssignments = useMemo(() => {
    if (!clusterData?.assignments) return [];
    return clusterData.assignments
      .map((a) => ({
        ...a,
        endpoint: endpointsById.get(a.endpointId) ?? null,
        primaryLabel: clusterData.clusters.find((c) => c.id === a.primaryClusterId)?.label ?? a.primaryClusterId
      }))
      .filter((x) => x.endpoint);
  }, [clusterData, endpointsById]);

  async function generateClusters(force: boolean): Promise<void> {
    if (!runId) return;
    setLoading(true);
    setError("");
    setSelectedEndpoint(null);
    try {
      const response = await fetch(`/api/runs/${runId}/cluster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const data = (await response.json()) as EndpointClusterResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to cluster endpoints.");
      }
      setClusterData(data);
      setSelectedClusterId(data.clusters[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cluster endpoints.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">LLM</h1>
        <p className="admin-page-subtitle">Run clustering in a dedicated workspace with cleaner, deduplicated output.</p>
      </header>
      <section className="admin-card mb-6">
        <h2 className="admin-card-title">LLM workspace</h2>
        <div className="max-w-xl">
          <label htmlFor="llm-run" className="admin-label">
            Run
          </label>
          <select
            id="llm-run"
            className="admin-select"
            value={runId}
            onChange={(event) => {
              const next = event.target.value;
              setRunId(next);
              if (next) {
                setWorkflowSelection({ runId: next });
              }
            }}
          >
            <option value="">Select run</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.targetUrl ?? run.id}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!runId || loading}
            onClick={() => void generateClusters(false)}
          >
            {loading ? "Loading…" : "Load saved categories"}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!runId || loading}
            onClick={() => void generateClusters(true)}
          >
            {loading ? "Regenerating…" : "Regenerate categories"}
          </button>
        </div>
        {clusterData?.meta.savedAt ? (
          <p className="muted mt-3 text-xs">
            Saved: {new Date(clusterData.meta.savedAt).toLocaleString()} · Built from {clusterData.meta.endpointCountAtBuild ?? 0} endpoints
            {clusterData.meta.cached ? " · loaded from cache" : " · freshly generated"}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Clusters</h2>
          <div className="space-y-2">
            {(clusterData?.clusters ?? []).map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  activeCluster?.id === cluster.id
                    ? "border-indigo-500 bg-indigo-600/20 text-indigo-100"
                    : "border-slate-800/80 bg-slate-950/40 text-slate-300 hover:bg-slate-900/60"
                }`}
                onClick={() => setSelectedClusterId(cluster.id)}
              >
                <span className="font-medium">{cluster.label}</span>
                <span className="ml-2 text-xs text-slate-500">({cluster.members.length})</span>
              </button>
            ))}
            {clusterData && clusterData.clusters.length === 0 ? <p className="muted mb-0 text-sm">No clusters generated.</p> : null}
          </div>
        </section>

        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Deduplicated endpoint assignments</h2>
          {activeCluster?.summary ? <p className="muted mb-3 text-sm">{activeCluster.summary}</p> : null}
          <div className="table-wrap overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>URL</th>
                  <th>Primary cluster</th>
                  <th>Secondary tags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listedAssignments
                  .filter((item) => item.primaryClusterId === (activeCluster?.id ?? item.primaryClusterId))
                  .map((item) => (
                    <tr key={item.endpointId} onClick={() => setSelectedEndpoint(item.endpoint!)}>
                      <td>
                        <span className={`badge method-${item.endpoint!.method}`}>{item.endpoint!.method}</span>
                      </td>
                      <td className="font-mono text-xs text-slate-300" title={item.endpoint!.resolvedUrl}>
                        <span className="truncate-text">{item.endpoint!.resolvedUrl}</span>
                      </td>
                      <td>{item.primaryLabel}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {item.secondaryTags.length === 0 ? <span className="text-xs text-slate-500">—</span> : null}
                          {item.secondaryTags.map((tag) => (
                            <span key={tag} className="badge">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <SendToRepeaterButton endpoint={item.endpoint!} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="dashboard-grid mt-6">
        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Endpoint details</h2>
          <p className="muted mb-0 text-sm">Select an assignment row to inspect endpoint details and explain output.</p>
        </section>
        <EndpointDetailDrawer key={selectedEndpoint?.id ?? "none"} endpoint={selectedEndpoint} llmEnabled />
      </section>
    </main>
  );
}
