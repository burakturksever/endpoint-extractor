"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EndpointDetailDrawer } from "@/components/endpoint-detail-drawer";
import { RepeaterRelativeUrlDialog } from "@/components/repeater-relative-url-dialog";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { fetchAllRunEndpoints } from "@/lib/client/fetch-all-run-endpoints";
import { getWorkflowSelection, setWorkflowSelection } from "@/lib/client/workflow-selection";
import { normalizeHttpUrlForRepeater } from "@/lib/repeater/request-normalization";
import { resolveRelativeUrlCandidates, type RelativeUrlResolveCandidate } from "@/lib/repeater/relative-url-resolver";
import type { AppSettingsState, EndpointRecord, RepeaterRequestRecord, RunState } from "@/lib/types/endpoints";

export default function RepeaterPage(): React.ReactElement {
  const urlRequestIdRef = useRef("");
  const restoredRequestRef = useRef(false);
  const prevRunIdRef = useRef<string | null>(null);

  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [endpointId, setEndpointId] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  const [requests, setRequests] = useState<RepeaterRequestRecord[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [sendResult, setSendResult] = useState<{ status: number; durationMs: number; headers: string; body: string } | null>(null);
  const [responseView, setResponseView] = useState<"raw" | "preview">("raw");
  const [error, setError] = useState("");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [resolverDialog, setResolverDialog] = useState<{ relativeUrl: string; candidates: RelativeUrlResolveCandidate[] } | null>(null);
  const resolveDecisionRef = useRef<((value: string | null) => void) | null>(null);

  const selectedEndpoint = useMemo(() => endpoints.find((item) => item.id === endpointId) ?? null, [endpointId, endpoints]);
  const selectedRun = useMemo(() => runs.find((item) => item.id === runId) ?? null, [runId, runs]);
  const responseIsHtml = useMemo(() => {
    if (!sendResult) {
      return false;
    }
    const headersLower = sendResult.headers.toLowerCase();
    if (headersLower.includes("content-type:") && headersLower.includes("text/html")) {
      return true;
    }
    const bodyStart = sendResult.body.trim().slice(0, 256).toLowerCase();
    return bodyStart.startsWith("<!doctype html") || bodyStart.startsWith("<html");
  }, [sendResult]);

  const refreshRequests = useCallback(
    async (nextRunId: string): Promise<void> => {
      const response = await fetch(`/api/repeater?runId=${encodeURIComponent(nextRunId)}`);
      const data = (await response.json()) as { requests: RepeaterRequestRecord[] };
      setRequests(data.requests);
      const reqId = urlRequestIdRef.current;
      if (!reqId || restoredRequestRef.current) {
        return;
      }
      const request = data.requests.find((item) => item.id === reqId);
      if (!request) {
        return;
      }
      restoredRequestRef.current = true;
      urlRequestIdRef.current = "";
      setActiveRequestId(request.id);
      setEndpointId(request.endpointId ?? "");
      setMethod(request.method);
      setUrl(request.url);
      setHeaders(request.headers);
      setBody(request.body ?? "");
    },
    []
  );

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      urlRequestIdRef.current = params.get("requestId") ?? "";
      const fromUrl = params.get("runId") ?? "";
      const response = await fetch("/api/runs");
      const data = (await response.json()) as { runs: RunState[] };
      setRuns(data.runs);
      try {
        const settingsResponse = await fetch("/api/settings");
        const settingsData = (await settingsResponse.json()) as { settings?: AppSettingsState };
        setLlmEnabled(Boolean(settingsData.settings?.llmEnabled));
      } catch {
        setLlmEnabled(false);
      }
      const wf = getWorkflowSelection();
      const fromSession = wf?.runId ?? "";
      setRunId(fromUrl || fromSession);
    })();
  }, []);

  useEffect(() => {
    if (!runId) return;
    const prev = prevRunIdRef.current;
    const userChangedRun = prev !== null && prev !== runId;
    prevRunIdRef.current = runId;
    setWorkflowSelection({ runId });

    if (userChangedRun) {
      restoredRequestRef.current = false;
      urlRequestIdRef.current = "";
      setEndpointId("");
      setActiveRequestId("");
      setMethod("GET");
      setUrl("");
      setHeaders("");
      setBody("");
      setSendResult(null);
    }

    void (async () => {
      try {
        const data = await fetchAllRunEndpoints(runId);
        setEndpoints(data.endpoints);
      } catch {
        setEndpoints([]);
      }
      await refreshRequests(runId);
      prevRunIdRef.current = runId;
    })();
  }, [refreshRequests, runId]);

  async function saveDraft(preResolvedUrl?: string): Promise<string | null> {
    setError("");
    const normalizedUrl = preResolvedUrl ?? (await resolveUrlForRepeater(url));
    if (!normalizedUrl) {
      return null;
    }
    const response = await fetch("/api/repeater", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeRequestId || undefined,
        runId,
        endpointId: endpointId || undefined,
        method,
        url: normalizedUrl,
        headers,
        body: body || undefined
      })
    });
    const data = (await response.json()) as { request?: RepeaterRequestRecord; error?: string };
    if (!response.ok || !data.request) {
      setError(typeof data.error === "string" ? data.error : "Failed to save request.");
      return null;
    }
    setActiveRequestId(data.request.id);
    await refreshRequests(runId);
    return data.request.id;
  }

  async function sendRequest(): Promise<void> {
    setError("");
    const normalizedUrl = await resolveUrlForRepeater(url);
    if (!normalizedUrl) return;
    const requestId = activeRequestId || (await saveDraft(normalizedUrl));
    if (!requestId) return;
    const response = await fetch(`/api/repeater/${requestId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, url: normalizedUrl, headers, body: body || undefined })
    });
    const data = (await response.json()) as {
      response?: { status: number; durationMs: number; headers: string; body: string };
      error?: string;
    };
    if (!response.ok || !data.response) {
      setError(typeof data.error === "string" ? data.error : "Failed to send request.");
      return;
    }
    setSendResult(data.response);
    setResponseView("raw");
    setUrl(normalizedUrl);
    await refreshRequests(runId);
  }

  async function resolveUrlForRepeater(rawUrl: string): Promise<string | null> {
    const normalized = normalizeHttpUrlForRepeater(rawUrl);
    if (normalized.ok) {
      return normalized.url;
    }
    if (normalized.code !== "relative_url") {
      setError(normalized.error);
      return null;
    }
    const resolved = resolveRelativeUrlCandidates({
      relativeUrl: rawUrl,
      endpoint: selectedEndpoint ? { originUrl: selectedEndpoint.originUrl, pageUrl: selectedEndpoint.pageUrl } : null,
      runTargetUrl: selectedRun?.targetUrl ?? null,
      runEndpoints: endpoints
    });
    if (!resolved.canResolve) {
      setError(normalized.error);
      return null;
    }
    setResolverDialog({ relativeUrl: rawUrl, candidates: resolved.candidates });
    const decision = await new Promise<string | null>((resolve) => {
      resolveDecisionRef.current = resolve;
    });
    resolveDecisionRef.current = null;
    if (!decision) {
      setError(normalized.error);
      return null;
    }
    setError("");
    return decision;
  }

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">Repeater</h1>
        <p className="admin-page-subtitle">Build, replay, and inspect custom HTTP requests.</p>
      </header>
      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Request Builder</h2>
        <div className="grid grid-cols-1 gap-3">
          <select
            className="admin-select max-w-xl"
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value);
            }}
          >
            <option value="">Select run</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.targetUrl ?? run.id}
              </option>
            ))}
          </select>
          {endpointId ? (
            <p className="muted mb-0 text-sm">
              Linked endpoint:{" "}
              {selectedEndpoint ? (
                <>
                  <span className={`badge method-${selectedEndpoint.method}`}>{selectedEndpoint.method}</span>{" "}
                  <span className="break-all font-mono text-xs text-slate-400">{selectedEndpoint.resolvedUrl}</span>
                </>
              ) : (
                <span className="font-mono text-xs text-slate-500">{endpointId}</span>
              )}
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[130px_minmax(0,1fr)]">
          <select className="admin-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "UNKNOWN"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input className="admin-input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://target/path" />
        </div>
        <textarea className="admin-textarea mt-3 font-mono text-xs" rows={6} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Header: value" />
        <textarea className="admin-textarea mt-3 font-mono text-xs" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Request body (optional)" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={!runId || !url} onClick={() => void saveDraft()}>
            Save draft
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!runId || !url} onClick={() => void sendRequest()}>
            Send
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Saved Requests</h2>
        <div className="space-y-2">
          {requests.map((request) => (
            <button
              key={request.id}
              type="button"
              className="flex w-full items-center justify-between rounded border border-slate-800/80 px-3 py-2 text-left hover:bg-slate-900/60"
              onClick={() => {
                setActiveRequestId(request.id);
                setEndpointId(request.endpointId ?? "");
                setMethod(request.method);
                setUrl(request.url);
                setHeaders(request.headers);
                setBody(request.body ?? "");
              }}
            >
              <span className="truncate font-mono text-xs text-slate-300">
                {request.method} {request.url}
              </span>
              <span className="text-xs text-slate-500">{request.lastResponseStatus ?? "-"}</span>
            </button>
          ))}
          {requests.length === 0 ? <p className="muted mb-0 text-sm">No saved requests yet.</p> : null}
        </div>
      </section>

      {sendResult ? (
        <section className="admin-card mb-6">
          <h2 className="admin-card-title">Response</h2>
          <p className="muted mb-3 text-sm">
            HTTP {sendResult.status} in {sendResult.durationMs}ms
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={responseView === "raw" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              onClick={() => setResponseView("raw")}
            >
              Raw
            </button>
            <button
              type="button"
              className={responseView === "preview" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              onClick={() => setResponseView("preview")}
              disabled={!responseIsHtml}
              title={responseIsHtml ? "Preview HTML response" : "Preview is available for HTML responses only"}
            >
              Preview
            </button>
          </div>
          <textarea className="admin-textarea mb-3 font-mono text-xs" rows={6} value={sendResult.headers} readOnly />
          {responseView === "preview" && responseIsHtml ? (
            <iframe
              title="HTML response preview"
              className="h-[520px] w-full rounded border border-slate-800/80 bg-white"
              sandbox=""
              srcDoc={sendResult.body}
            />
          ) : (
            <textarea className="admin-textarea font-mono text-xs" rows={10} value={sendResult.body} readOnly />
          )}
        </section>
      ) : null}

      <section className="dashboard-grid">
        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Endpoint context</h2>
          <p className="muted mb-0 text-sm">Use Send to Repeater from endpoint tables to link a draft; Explain appears when the endpoint is loaded above.</p>
        </section>
        <EndpointDetailDrawer key={selectedEndpoint?.id ?? "none"} endpoint={selectedEndpoint} llmEnabled={llmEnabled} />
      </section>
      <RepeaterRelativeUrlDialog
        key={`${resolverDialog?.relativeUrl ?? ""}:${resolverDialog?.candidates[0]?.resolvedUrl ?? ""}`}
        open={resolverDialog !== null}
        relativeUrl={resolverDialog?.relativeUrl ?? ""}
        candidates={resolverDialog?.candidates ?? []}
        onCancel={() => {
          resolveDecisionRef.current?.(null);
          setResolverDialog(null);
        }}
        onConfirm={(resolvedUrl) => {
          resolveDecisionRef.current?.(resolvedUrl);
          setResolverDialog(null);
        }}
      />
    </main>
  );
}
