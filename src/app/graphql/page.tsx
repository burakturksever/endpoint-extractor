"use client";

import { useEffect, useState } from "react";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { getWorkflowSelection, setWorkflowSelection } from "@/lib/client/workflow-selection";
import type { EndpointRecord, GraphqlDetectionResponse, GraphqlEnumerationResponse, RunState } from "@/lib/types/endpoints";

export default function GraphqlPage(): React.ReactElement {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState("");
  const [detected, setDetected] = useState<GraphqlDetectionResponse | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [operation, setOperation] = useState("query { __typename }");
  const [variablesJson, setVariablesJson] = useState("{}");
  const [loadingDetect, setLoadingDetect] = useState(false);
  const [loadingEnum, setLoadingEnum] = useState(false);
  const [enumResult, setEnumResult] = useState<GraphqlEnumerationResponse | null>(null);
  const [error, setError] = useState("");

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

  async function detectCandidates(nextRunId: string): Promise<void> {
    if (!nextRunId) {
      setDetected(null);
      setEndpointUrl("");
      return;
    }
    setLoadingDetect(true);
    setError("");
    try {
      const response = await fetch("/api/graphql/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: nextRunId })
      });
      const data = (await response.json()) as GraphqlDetectionResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "GraphQL detection failed.");
      }
      setDetected(data);
      if (data.candidates.length > 0) {
        setEndpointUrl(data.candidates[0].url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "GraphQL detection failed.");
    } finally {
      setLoadingDetect(false);
    }
  }

  useEffect(() => {
    if (!runId) {
      return;
    }
    setWorkflowSelection({ runId });
    queueMicrotask(() => {
      void detectCandidates(runId);
    });
  }, [runId]);

  async function runEnumeration(): Promise<void> {
    if (!endpointUrl.trim()) return;
    setLoadingEnum(true);
    setError("");
    setEnumResult(null);
    try {
      const response = await fetch("/api/graphql/enumerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          endpointUrl,
          headers,
          authToken,
          operation,
          variablesJson
        })
      });
      const data = (await response.json()) as GraphqlEnumerationResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "GraphQL enumeration failed.");
      }
      setEnumResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GraphQL enumeration failed.");
    } finally {
      setLoadingEnum(false);
    }
  }

  const syntheticEndpoint: EndpointRecord | null =
    runId && endpointUrl
      ? {
          id: `graphql:${runId}:${endpointUrl}`,
          runId,
          dedupeHash: `graphql:${endpointUrl}`,
          originUrl: endpointUrl,
          registrableDomain: (() => {
            try {
              return new URL(endpointUrl).hostname;
            } catch {
              return "";
            }
          })(),
          pageUrl: endpointUrl,
          sourceType: "network",
          confidence: "high",
          method: "POST",
          rawExpression: endpointUrl,
          resolvedUrl: endpointUrl,
          inferredParams: [],
          inferenceTrail: "graphql-tab",
          firstSeenAt: new Date().toISOString()
        }
      : null;

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">GraphQL</h1>
        <p className="admin-page-subtitle">Enumerate and explore GraphQL endpoints for the selected run.</p>
      </header>
      <section className="admin-card mb-6">
        <h2 className="admin-card-title">GraphQL workspace</h2>
        <div className="max-w-xl space-y-3">
          <label htmlFor="graphql-run" className="admin-label">
            Run
          </label>
          <select
            id="graphql-run"
            className="admin-select"
            value={runId}
            onChange={(event) => {
              const next = event.target.value;
              setRunId(next);
              if (next) {
                setWorkflowSelection({ runId: next });
              } else {
                setDetected(null);
                setEndpointUrl("");
                setEnumResult(null);
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
          <label htmlFor="graphql-endpoint" className="admin-label">
            Endpoint URL
          </label>
          <input
            id="graphql-endpoint"
            className="admin-input font-mono text-xs"
            value={endpointUrl}
            onChange={(event) => setEndpointUrl(event.target.value)}
            placeholder="https://target/graphql"
          />
          <label htmlFor="graphql-headers" className="admin-label">
            Headers
          </label>
          <textarea
            id="graphql-headers"
            className="admin-textarea font-mono text-xs"
            rows={4}
            value={headers}
            onChange={(event) => setHeaders(event.target.value)}
            placeholder="Header: value"
          />
          <label htmlFor="graphql-token" className="admin-label">
            Auth token (optional)
          </label>
          <input
            id="graphql-token"
            className="admin-input font-mono text-xs"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            placeholder="Bearer token value only"
          />
          <label htmlFor="graphql-op" className="admin-label">
            Operation
          </label>
          <textarea
            id="graphql-op"
            className="admin-textarea font-mono text-xs"
            rows={8}
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
          />
          <label htmlFor="graphql-vars" className="admin-label">
            Variables JSON
          </label>
          <textarea
            id="graphql-vars"
            className="admin-textarea font-mono text-xs"
            rows={4}
            value={variablesJson}
            onChange={(event) => setVariablesJson(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!runId || loadingDetect}
              onClick={() => void detectCandidates(runId)}
            >
              {loadingDetect ? "Detecting…" : "Auto-detect GraphQL"}
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => void runEnumeration()}
              disabled={!endpointUrl || loadingEnum}
            >
              {loadingEnum ? "Enumerating…" : "Run enumeration"}
            </button>
            {syntheticEndpoint ? <SendToRepeaterButton endpoint={syntheticEndpoint} /> : null}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        {detected ? (
          <p className="muted mt-3 mb-0 text-sm">
            {detected.detected
              ? `Detected ${detected.candidates.length} GraphQL candidate endpoint(s).`
              : "No strong GraphQL candidates detected for this run."}
          </p>
        ) : null}
      </section>

      <section className="admin-card">
        <h2 className="admin-card-title">Enumeration result</h2>
        {!enumResult ? <p className="muted mb-0 text-sm">Run enumeration to view results.</p> : null}
        {enumResult ? (
          <>
            <p className="mb-2 text-sm text-slate-300">
              {enumResult.ok ? "GraphQL reachable." : "GraphQL probe incomplete."} status: {enumResult.status ?? "n/a"} ·{" "}
              {enumResult.durationMs}ms
            </p>
            <p className="mb-2 text-sm text-slate-400">
              Introspection: {enumResult.introspectionAvailable ? "yes" : "no"} · __typename probe:{" "}
              {enumResult.typenameProbeOk ? "yes" : "no"}
            </p>
            {enumResult.schema ? (
              <div className="mb-3 rounded border border-slate-800/80 bg-slate-950/40 p-3 text-xs text-slate-300">
                <p className="mb-1">queryType: {enumResult.schema.queryType ?? "n/a"}</p>
                <p className="mb-1">mutationType: {enumResult.schema.mutationType ?? "n/a"}</p>
                <p className="mb-0">Known types: {enumResult.schema.typeNames.slice(0, 25).join(", ") || "none"}</p>
              </div>
            ) : null}
            {enumResult.errors.length > 0 ? (
              <ul className="mb-3 list-disc pl-5 text-xs text-amber-300">
                {enumResult.errors.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            ) : null}
            <textarea className="admin-textarea font-mono text-xs" rows={12} value={enumResult.responsePreview} readOnly />
          </>
        ) : null}
      </section>
    </main>
  );
}
