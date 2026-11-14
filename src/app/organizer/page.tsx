"use client";

import { useEffect, useMemo, useState } from "react";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { fetchAllRunEndpoints } from "@/lib/client/fetch-all-run-endpoints";
import { getWorkflowSelection } from "@/lib/client/workflow-selection";
import type { EndpointRecord, OrganizerItemRecord, OrganizerLabel, RepeaterRequestRecord, RunState } from "@/lib/types/endpoints";

const labels: OrganizerLabel[] = ["Finding", "Potential Finding", "Note"];

export default function OrganizerPage(): React.ReactElement {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [requests, setRequests] = useState<RepeaterRequestRecord[]>([]);
  const [items, setItems] = useState<OrganizerItemRecord[]>([]);
  const [runId, setRunId] = useState("");
  const [label, setLabel] = useState<OrganizerLabel>("Note");
  const [description, setDescription] = useState("");
  const [repeaterRequestId, setRepeaterRequestId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<OrganizerLabel | "ALL">("ALL");

  const filteredItems = useMemo(() => (filter === "ALL" ? items : items.filter((item) => item.label === filter)), [filter, items]);

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

  useEffect(() => {
    if (!runId) return;
    void refreshItems(runId);
    void refreshRequests(runId);
    void (async () => {
      const data = await fetchAllRunEndpoints(runId);
      setEndpoints(data.endpoints);
    })();
  }, [runId]);

  async function refreshItems(nextRunId: string): Promise<void> {
    const response = await fetch(`/api/organizer?runId=${encodeURIComponent(nextRunId)}`);
    const data = (await response.json()) as { items: OrganizerItemRecord[] };
    setItems(data.items);
  }

  async function refreshRequests(nextRunId: string): Promise<void> {
    const response = await fetch(`/api/repeater?runId=${encodeURIComponent(nextRunId)}`);
    const data = (await response.json()) as { requests: RepeaterRequestRecord[] };
    setRequests(data.requests);
  }

  async function createItem(): Promise<void> {
    setError("");
    const response = await fetch("/api/organizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        label,
        description,
        endpointId: endpointId || undefined,
        repeaterRequestId: repeaterRequestId || undefined
      })
    });
    const data = (await response.json()) as { item?: OrganizerItemRecord; error?: string };
    if (!response.ok || !data.item) {
      setError(data.error ?? "Failed to save organizer item.");
      return;
    }
    setDescription("");
    setRepeaterRequestId("");
    setEndpointId("");
    await refreshItems(runId);
  }

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">Organizer</h1>
        <p className="admin-page-subtitle">Save findings, notes, and repeater-linked investigation context.</p>
      </header>

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">New item</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="admin-select" value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">Select run</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.targetUrl ?? run.id}
              </option>
            ))}
          </select>
          <select className="admin-select" value={label} onChange={(e) => setLabel(e.target.value as OrganizerLabel)}>
            {labels.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className="admin-select" value={repeaterRequestId} onChange={(e) => setRepeaterRequestId(e.target.value)}>
            <option value="">Link repeater request (optional)</option>
            {requests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.method} {request.url}
              </option>
            ))}
          </select>
          <select className="admin-select md:col-span-3" value={endpointId} onChange={(e) => setEndpointId(e.target.value)}>
            <option value="">Link endpoint (optional)</option>
            {endpoints.map((endpoint) => (
              <option key={endpoint.id} value={endpoint.id}>
                {endpoint.method} {endpoint.resolvedUrl}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="admin-textarea mt-3"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add investigation details"
        />
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={!runId || !description.trim()} onClick={() => void createItem()}>
            Save item
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section className="admin-card">
        <h2 className="admin-card-title">Saved items</h2>
        <div className="mb-3 flex gap-2">
          <button type="button" className="btn-ghost btn-sm border border-slate-700" onClick={() => setFilter("ALL")}>
            All
          </button>
          {labels.map((value) => (
            <button key={value} type="button" className="btn-ghost btn-sm border border-slate-700" onClick={() => setFilter(value)}>
              {value}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              {item.endpointId ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {(() => {
                    const endpoint = endpoints.find((value) => value.id === item.endpointId);
                    if (!endpoint) {
                      return <span className="text-xs text-slate-500">endpoint: {item.endpointId}</span>;
                    }
                    return (
                      <>
                        <span className={`badge method-${endpoint.method}`}>{endpoint.method}</span>
                        <span className="max-w-[62ch] truncate font-mono text-xs text-slate-400" title={endpoint.resolvedUrl}>
                          {endpoint.resolvedUrl}
                        </span>
                        <SendToRepeaterButton endpoint={endpoint} className="btn-secondary btn-sm" />
                      </>
                    );
                  })()}
                </div>
              ) : null}
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="badge">{item.label}</span>
                <span className="text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()}</span>
              </div>
              <p className="mb-2 whitespace-pre-wrap text-sm text-slate-300">{item.description}</p>
              <p className="mb-0 text-xs text-slate-500">
                run: {item.runId}
                {item.repeaterRequestId ? ` · repeater: ${item.repeaterRequestId}` : ""}
                {item.endpointId ? ` · endpoint: ${item.endpointId}` : ""}
              </p>
            </article>
          ))}
          {filteredItems.length === 0 ? <p className="muted mb-0 text-sm">No organizer entries.</p> : null}
        </div>
      </section>
    </main>
  );
}
