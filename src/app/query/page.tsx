"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EndpointDetailDrawer } from "@/components/endpoint-detail-drawer";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { getWorkflowSelection, setWorkflowSelection } from "@/lib/client/workflow-selection";
import type { AppSettingsState, EndpointRecord, RunState } from "@/lib/types/endpoints";

interface QueryGroup {
  siteUrl: string;
  domain: string;
  endpoints: EndpointRecord[];
}

export default function QueryPage(): React.ReactElement {
  const [query, setQuery] = useState("");
  const [regexMode, setRegexMode] = useState(true);
  const [flags, setFlags] = useState("i");
  const [groups, setGroups] = useState<QueryGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [selected, setSelected] = useState<EndpointRecord | null>(null);
  const [pageSize] = useState(120);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [filterRunId, setFilterRunId] = useState("");
  const [runsForFilter, setRunsForFilter] = useState<RunState[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings");
        const data = (await response.json()) as { settings?: AppSettingsState };
        setLlmEnabled(Boolean(data.settings?.llmEnabled));
      } catch {
        setLlmEnabled(false);
      }
      try {
        const runsResponse = await fetch("/api/runs");
        const runsData = (await runsResponse.json()) as { runs: RunState[] };
        setRunsForFilter(runsData.runs);
      } catch {
        setRunsForFilter([]);
      }
      const wf = getWorkflowSelection();
      if (wf?.runId) {
        setFilterRunId(wf.runId);
      }
    })();
  }, []);

  const invalidRegex = useMemo(() => {
    if (!regexMode || !query) {
      return "";
    }
    try {
      new RegExp(query, flags);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid regex";
    }
  }, [flags, query, regexMode]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.endpoints), [groups]);
  const currentPage = cursorHistory.length + 1;

  async function runQuery(next?: { cursor?: string | null; fromHistory?: Array<string | null> }): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: query,
        regex: String(regexMode),
        flags,
        pageSize: String(pageSize)
      });
      if (filterRunId) {
        params.set("runId", filterRunId);
      }
      if (next?.cursor) {
        params.set("cursor", next.cursor);
      }
      const response = await fetch(`/api/query?${params.toString()}`);
      const data = (await response.json()) as {
        groups: QueryGroup[];
        total: number;
        cursor: string | null;
        nextCursor: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Query failed.");
      }
      setGroups(data.groups);
      setTotal(data.total);
      setCursor(data.cursor);
      setNextCursor(data.nextCursor);
      setCursorHistory(next?.fromHistory ?? []);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">Global endpoint query</h1>
        <p className="admin-page-subtitle">Run plain or regex searches across all discovered endpoints.</p>
        <p className="mt-3 mb-0">
          <Link href="/endpoints" className="text-sm font-medium">
            Back to endpoints
          </Link>
        </p>
      </header>

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Search</h2>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto_auto]">
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <label htmlFor="query" className="admin-label">
              Query / regex
            </label>
            <input
              id="query"
              className="admin-input font-mono text-[13px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="api|graphql|v1/users"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="flags" className="admin-label">
              Regex flags
            </label>
            <input id="flags" className="admin-input font-mono" value={flags} onChange={(event) => setFlags(event.target.value)} placeholder="i" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-300 sm:pb-0">
            <input type="checkbox" className="admin-checkbox" checked={regexMode} onChange={(event) => setRegexMode(event.target.checked)} />
            Regex mode
          </label>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => void runQuery({ cursor: null, fromHistory: [] })}
            disabled={loading || Boolean(invalidRegex)}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {invalidRegex ? <p className="mb-0 mt-3 text-sm text-rose-400">{invalidRegex}</p> : null}
        {error ? <p className="mb-0 mt-3 text-sm text-rose-400">{error}</p> : null}
        <div className="mt-4 max-w-xl">
          <label htmlFor="filter-run" className="admin-label">
            Limit search to run (optional)
          </label>
          <select
            id="filter-run"
            className="admin-select"
            value={filterRunId}
            onChange={(event) => {
              const nextId = event.target.value;
              setFilterRunId(nextId);
              if (nextId) {
                setWorkflowSelection({ runId: nextId });
              }
            }}
          >
            <option value="">All runs</option>
            {runsForFilter.map((run) => (
              <option key={run.id} value={run.id}>
                {run.targetUrl ?? run.id}
              </option>
            ))}
          </select>
        </div>
      </section>

      {llmEnabled && flatResults.length > 0 ? (
        <section className="admin-card mb-6">
          <h2 className="admin-card-title">LLM analysis moved</h2>
          <p className="muted mb-3 text-sm">Generate and inspect deduplicated clusters in the dedicated LLM tab.</p>
          <Link href="/llm" className="btn-primary btn-sm">
            Open LLM workspace
          </Link>
        </section>
      ) : null}

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Results ({total})</h2>
        {flatResults.length === 0 ? <p className="muted mb-0 text-sm">No matches.</p> : null}
        <div className="table-wrap overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th className="w-24">Method</th>
                <th>URL</th>
                <th className="w-28">Source</th>
                <th className="w-28">Confidence</th>
                <th className="w-40">Run</th>
                <th className="w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flatResults.map((endpoint) => (
                <tr key={endpoint.id} onClick={() => setSelected(endpoint)}>
                  <td>
                    <span className={`badge method-${endpoint.method}`}>{endpoint.method}</span>
                  </td>
                  <td title={endpoint.resolvedUrl}>
                    <span className="truncate-text font-mono text-xs text-slate-300">{endpoint.resolvedUrl}</span>
                  </td>
                  <td className="text-slate-400">{endpoint.sourceType}</td>
                  <td className="text-slate-400">{endpoint.confidence}</td>
                  <td className="truncate font-mono text-xs text-slate-500" title={endpoint.runId}>
                    {endpoint.runId}
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <SendToRepeaterButton endpoint={endpoint} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-sm text-slate-400">
            <button
              type="button"
              className="btn-ghost btn-sm border border-slate-700"
              disabled={cursorHistory.length === 0 || loading}
              onClick={() => {
                if (cursorHistory.length === 0) return;
                const previousHistory = cursorHistory.slice(0, -1);
                const previousCursor = cursorHistory[cursorHistory.length - 1] ?? null;
                void runQuery({ cursor: previousCursor, fromHistory: previousHistory });
              }}
            >
              Previous
            </button>
            <span className="tabular-nums">
              Page {currentPage}
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm border border-slate-700"
              disabled={!nextCursor || loading}
              onClick={() => {
                if (!nextCursor) return;
                void runQuery({
                  cursor: nextCursor,
                  fromHistory: [...cursorHistory, cursor]
                });
              }}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>

      <section className="dashboard-grid">
        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Search context</h2>
          <p className="muted mb-0 text-sm">Select a result row or cluster member to inspect and use Explain.</p>
        </section>
        <EndpointDetailDrawer key={selected?.id ?? "none"} endpoint={selected} llmEnabled={llmEnabled} />
      </section>
    </main>
  );
}
