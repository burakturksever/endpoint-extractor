"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EndpointDetailDrawer } from "@/components/endpoint-detail-drawer";
import { EndpointTable } from "@/components/endpoint-table";
import { RunForm } from "@/components/run-form";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { fetchAllRunEndpoints } from "@/lib/client/fetch-all-run-endpoints";
import { setWorkflowSelection } from "@/lib/client/workflow-selection";
import type {
  AppSettingsState,
  BatchRunState,
  DiscoveredDomainRecord,
  EndpointRecord,
  RunState
} from "@/lib/types/endpoints";
import { formatSeedUrlForDisplay, runSelectDisplayLabel } from "@/lib/ui/format-seed-url";

const DOMAINS_PAGE_SIZE = 10;

function decisionBadgeClass(decision: DiscoveredDomainRecord["decision"]): string {
  if (decision === "approved") return "badge-decision-approved";
  if (decision === "rejected") return "badge-decision-rejected";
  return "badge-decision-pending";
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function Dashboard(): React.ReactElement {
  const [batches, setBatches] = useState<BatchRunState[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>("");
  const [activeBatch, setActiveBatch] = useState<BatchRunState | null>(null);
  const [domains, setDomains] = useState<DiscoveredDomainRecord[]>([]);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [activeRun, setActiveRun] = useState<RunState | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selected, setSelected] = useState<EndpointRecord | null>(null);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [domainsPanelOpen, setDomainsPanelOpen] = useState(false);
  const [domainsTab, setDomainsTab] = useState<"pending" | "all">("pending");
  const [domainPage, setDomainPage] = useState(1);

  useEffect(() => {
    void refreshBatches();
    void refreshRuns();
    void (async () => {
      try {
        const response = await fetch("/api/settings");
        const data = (await response.json()) as { settings?: AppSettingsState };
        if (data.settings) {
          setLlmEnabled(data.settings.llmEnabled);
        }
      } catch {
        setLlmEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeBatchId) {
      setWorkflowSelection({ batchRunId: activeBatchId });
    }
  }, [activeBatchId]);

  useEffect(() => {
    if (activeRunId) {
      setWorkflowSelection({ runId: activeRunId });
    }
  }, [activeRunId]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }
    void fetchRun(activeRunId);
    const source = new EventSource(`/api/runs/${activeRunId}/events`);
    source.addEventListener("run", (event) => {
      const nextRun = JSON.parse(event.data) as RunState;
      setActiveRun(nextRun);
      setRuns((prev) => [nextRun, ...prev.filter((item) => item.id !== nextRun.id)]);
    });
    source.addEventListener("endpoint", (event) => {
      const endpoint = JSON.parse(event.data) as EndpointRecord;
      setEndpoints((prev) => {
        if (prev.some((item) => item.id === endpoint.id)) {
          return prev;
        }
        return [...prev, endpoint];
      });
    });
    return () => source.close();
  }, [activeRunId]);

  useEffect(() => {
    if (!activeBatchId) return;
    void fetchBatch(activeBatchId);
  }, [activeBatchId]);

  const pendingDomains = useMemo(() => domains.filter((d) => d.decision === "pending"), [domains]);
  const pendingCount = pendingDomains.length;
  const filteredDomains = useMemo(() => (domainsTab === "pending" ? pendingDomains : domains), [domains, domainsTab, pendingDomains]);
  const domainTotalPages = Math.max(1, Math.ceil(filteredDomains.length / DOMAINS_PAGE_SIZE));
  const domainSlicePage = Math.min(domainPage, domainTotalPages);
  const domainPageStart = (domainSlicePage - 1) * DOMAINS_PAGE_SIZE;
  const paginatedDomains = filteredDomains.slice(domainPageStart, domainPageStart + DOMAINS_PAGE_SIZE);

  const activeRunNeedsLogin = useMemo(
    () => activeRun?.status === "pending_login",
    [activeRun?.status]
  );
  const runStatusClass = `status-pill status-${activeRun?.status ?? "running"}`;
  const stats = useMemo(() => {
    const total = endpoints.length;
    const network = endpoints.filter((item) => item.sourceType === "network").length;
    const inferred = endpoints.filter((item) => item.sourceType !== "network").length;
    const withParams = endpoints.filter((item) => item.inferredParams.length > 0).length;
    const unresolvedDynamic = endpoints.filter((item) => item.resolvedUrl.includes("[dynamic")).length;
    const uniqueDomains = new Set(endpoints.map((item) => item.registrableDomain)).size;
    const covered = endpoints.filter((item) => item.covered).length;
    return { total, network, inferred, withParams, unresolvedDynamic, uniqueDomains, covered };
  }, [endpoints]);

  async function toggleCoverage(endpoint: EndpointRecord, covered: boolean): Promise<void> {
    await fetch(`/api/endpoints/${endpoint.id}/coverage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ covered })
    });
    setEndpoints((prev) => prev.map((item) => (item.id === endpoint.id ? { ...item, covered, coveredAt: covered ? new Date().toISOString() : undefined } : item)));
  }

  async function refreshRuns(): Promise<void> {
    const response = await fetch("/api/runs");
    const data = (await response.json()) as { runs: RunState[] };
    setRuns(data.runs);
  }

  async function refreshBatches(): Promise<void> {
    const response = await fetch("/api/batches");
    const data = (await response.json()) as { batches: BatchRunState[] };
    setBatches(data.batches);
  }

  async function fetchBatch(batchId: string): Promise<void> {
    const response = await fetch(`/api/batches/${batchId}`);
    const data = (await response.json()) as { batch: BatchRunState; runs: RunState[]; domains: DiscoveredDomainRecord[] };
    setActiveBatch(data.batch);
    setDomains(data.domains);
    setRuns((prev) => {
      const others = prev.filter((item) => item.batchRunId !== batchId);
      return [...data.runs, ...others];
    });
  }

  async function fetchRun(runId: string): Promise<void> {
    const data = await fetchAllRunEndpoints(runId);
    setActiveRun(data.run);
    setEndpoints(data.endpoints);
  }

  async function confirmLogin(): Promise<void> {
    if (!activeRunId) {
      return;
    }
    await fetch(`/api/runs/${activeRunId}/login`, { method: "POST" });
  }

  async function setDomainDecision(domain: string, decision: "approved" | "rejected"): Promise<void> {
    if (!activeBatchId) {
      return;
    }
    await fetch(`/api/batches/${activeBatchId}/domain-decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, decision })
    });
    await fetchBatch(activeBatchId);
    setDomainPage(1);
  }

  function resetDomainsUi(): void {
    setDomainsPanelOpen(false);
    setDomainsTab("pending");
    setDomainPage(1);
  }

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="admin-page-title">Endpoint Extractor</h1>
          <p className="admin-page-subtitle mb-0">
            Crawl authenticated pages and browse observed plus inferred API endpoints in real time.
          </p>
        </div>
        <Link href="/settings" className="btn-ghost btn-sm shrink-0 border border-slate-700">
          Settings
        </Link>
      </header>

      <section className="top-grid">
        <div className="admin-card">
          <h2 className="admin-card-title">Start new batch</h2>
          <RunForm
            onBatchCreated={(batchId, runId) => {
              resetDomainsUi();
              setActiveBatchId(batchId);
              setActiveRunId(runId);
              void refreshBatches();
              void refreshRuns();
            }}
          />
        </div>
        <div className="admin-card flex flex-col">
          <h2 className="admin-card-title">Run controls</h2>
          <div className="flex min-h-0 flex-1 flex-col space-y-4">
            <div>
              <label htmlFor="batch-select" className="admin-label">
                Batch history
              </label>
              <select
                id="batch-select"
                className="admin-select"
                value={activeBatchId}
                onChange={(event) => {
                  const nextBatchId = event.target.value;
                  resetDomainsUi();
                  setActiveBatchId(nextBatchId);
                  if (!nextBatchId) {
                    setActiveBatch(null);
                    setDomains([]);
                  }
                }}
              >
                <option value="">Select batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {(batch.targetSummary ?? "Batch").replace(/\s+/g, " ")} · {batch.status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="run-select" className="admin-label">
                Run history
              </label>
              <select id="run-select" className="admin-select" value={activeRunId} onChange={(event) => setActiveRunId(event.target.value)}>
                <option value="">Select run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runSelectDisplayLabel(run, runs)}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              {activeRun ? <span className={runStatusClass}>{activeRun.status.replace(/_/g, " ")}</span> : null}
              {activeRun?.targetUrl ? (
                <p className="mt-2 mb-0 truncate font-mono text-xs text-slate-400" title={activeRun.targetUrl}>
                  Target: {formatSeedUrlForDisplay(activeRun.targetUrl)}
                </p>
              ) : null}
              {activeRun ? <p className="mt-2 mb-0 text-sm text-slate-400">{activeRun.message}</p> : <p className="muted mb-0 text-sm">No run selected.</p>}
              {activeBatch?.targetSummary ? (
                <p className="mt-2 mb-0 text-xs text-slate-500" title={activeBatch.targetSummary}>
                  Batch targets: {activeBatch.targetSummary}
                </p>
              ) : activeBatch ? (
                <p className="mt-2 mb-0 text-xs text-slate-500">Batch: {activeBatch.message}</p>
              ) : null}
              {activeBatch?.unlimitedPages ? (
                <p className="mt-1 mb-0 text-xs text-amber-200/90">
                  Page budget: unlimited (nominal max {activeBatch.maxPages} for records; crawl still obeys depth + domain policy).
                </p>
              ) : null}
            </div>
            {activeRunNeedsLogin ? (
              <button type="button" className="btn-primary w-full" onClick={confirmLogin}>
                Login complete
              </button>
            ) : null}
            <div className="mt-auto border-t border-slate-800/80 pt-3">
              <Link href="/query" className="text-sm font-medium">
                Open global query
              </Link>
            </div>
          </div>
        </div>
      </section>

      {activeBatchId ? (
        <section className="mb-6">
          {domains.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 text-sm text-slate-500">
              No external domains discovered for this batch.
            </div>
          ) : (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-slate-800/90 bg-slate-900/50 px-4 py-3 text-left shadow-lg shadow-black/15 transition-colors hover:border-slate-700 hover:bg-slate-900/70"
                onClick={() => setDomainsPanelOpen((open) => !open)}
                aria-expanded={domainsPanelOpen}
              >
                <span className="relative shrink-0 text-slate-400">
                  <BellIcon />
                  {pendingCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow ring-2 ring-slate-900">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-200">
                    {pendingCount > 0
                      ? `You have ${pendingCount} external domain${pendingCount === 1 ? "" : "s"} waiting for approval`
                      : "External domains — nothing pending"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {domains.length} total · open to review, approve, or reject
                  </span>
                </span>
                <span className="shrink-0 text-slate-500" aria-hidden>
                  {domainsPanelOpen ? "▾" : "▸"}
                </span>
              </button>

              {domainsPanelOpen ? (
                <div className="mt-2 rounded-xl border border-slate-800/90 bg-slate-900/50 p-4 shadow-inner shadow-black/20 sm:p-5">
                  <p className="mb-4 text-sm text-slate-400">
                    Off-site pages are not crawled until you approve a domain. Reject to dismiss from the queue.
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-800/80 pb-3">
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        domainsTab === "pending"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setDomainsTab("pending");
                        setDomainPage(1);
                      }}
                    >
                      Pending ({pendingCount})
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        domainsTab === "all"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        setDomainsTab("all");
                        setDomainPage(1);
                      }}
                    >
                      All ({domains.length})
                    </button>
                  </div>
                  <ul className="space-y-3">
                    {paginatedDomains.length === 0 ? (
                      <li className="rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-10 text-center text-sm text-slate-500">
                        {domainsTab === "pending" ? "No domains waiting for approval." : "No domains in this batch."}
                      </li>
                    ) : (
                      paginatedDomains.map((domain) => (
                        <li key={domain.id} className="domain-row">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-white">{domain.domain}</span>
                              <span className={decisionBadgeClass(domain.decision)}>{domain.decision}</span>
                            </div>
                            <span className="domain-meta-url" title={domain.sourceUrl}>
                              Found from: {domain.sourceUrl}
                            </span>
                          </div>
                          <div className="domain-actions">
                            <button
                              type="button"
                              className="btn-success btn-sm"
                              disabled={domain.decision === "approved"}
                              onClick={() => void setDomainDecision(domain.domain, "approved")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              disabled={domain.decision === "rejected"}
                              onClick={() => void setDomainDecision(domain.domain, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                  {domainTotalPages > 1 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-sm text-slate-400">
                      <button
                        type="button"
                        className="btn-ghost btn-sm border border-slate-700"
                        disabled={domainSlicePage <= 1}
                        onClick={() => setDomainPage(domainSlicePage > 1 ? domainSlicePage - 1 : 1)}
                      >
                        Previous
                      </button>
                      <span className="tabular-nums">
                        Page {domainSlicePage} of {domainTotalPages}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm border border-slate-700"
                        disabled={domainSlicePage >= domainTotalPages}
                        onClick={() =>
                          setDomainPage(domainSlicePage < domainTotalPages ? domainSlicePage + 1 : domainTotalPages)
                        }
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Live metrics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total endpoints</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Network (high confidence)</div>
            <div className="stat-value">{stats.network}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Inferred (static + promise)</div>
            <div className="stat-value">{stats.inferred}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">With parameters</div>
            <div className="stat-value">{stats.withParams}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Registrable domains</div>
            <div className="stat-value">{stats.uniqueDomains}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unresolved dynamic paths</div>
            <div className="stat-value">{stats.unresolvedDynamic}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Covered endpoints</div>
            <div className="stat-value">{stats.covered}</div>
          </div>
        </div>
      </section>

      {llmEnabled && activeRunId ? (
        <section className="admin-card mb-6">
          <h2 className="admin-card-title">LLM analysis moved</h2>
          <p className="muted mb-3 text-sm">
            Clustering now lives in a dedicated LLM tab with deduplicated assignments and cleaner output.
          </p>
          <Link href="/llm" className="btn-primary btn-sm">
            Open LLM workspace
          </Link>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <EndpointTable
          endpoints={endpoints}
          onSelect={setSelected}
          onToggleCoverage={(endpoint, covered) => void toggleCoverage(endpoint, covered)}
          renderActions={(endpoint) => <SendToRepeaterButton endpoint={endpoint} />}
        />
        {selected ? (
          <EndpointDetailDrawer key={selected.id} endpoint={selected} llmEnabled={llmEnabled} />
        ) : (
          <section className="admin-card min-w-0">
            <h2 className="admin-card-title">Endpoint details</h2>
            <p className="muted mb-0 text-sm">Click any endpoint row to open full details here.</p>
          </section>
        )}
      </section>
    </main>
  );
}
