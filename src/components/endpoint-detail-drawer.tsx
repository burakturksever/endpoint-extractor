"use client";

import { useState } from "react";
import type { EndpointRecord } from "@/lib/types/endpoints";

interface EndpointDetailDrawerProps {
  endpoint: EndpointRecord | null;
  llmEnabled: boolean;
}

export function EndpointDetailDrawer({ endpoint, llmEnabled }: EndpointDetailDrawerProps): React.ReactElement {
  const [copied, setCopied] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [explanation, setExplanation] = useState("");

  function copy(value: string, key: string): void {
    void navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(""), 1200);
  }

  async function explain(): Promise<void> {
    if (!endpoint || !llmEnabled) {
      return;
    }
    setExplainLoading(true);
    setExplainError("");
    setExplanation("");
    try {
      const response = await fetch(`/api/runs/${endpoint.runId}/endpoints/${endpoint.id}/explain`, {
        method: "POST"
      });
      const data = (await response.json()) as { explanation?: string; error?: string; code?: string };
      if (!response.ok || !data.explanation) {
        if (data.code === "timeout") {
          throw new Error("LLM timed out while explaining this endpoint. Try again or use a smaller model.");
        }
        if (data.code === "truncated" || data.code === "invalid_json") {
          throw new Error("LLM output was truncated/invalid. Try again.");
        }
        throw new Error(data.error ?? "Explain request failed.");
      }
      setExplanation(data.explanation);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Explain failed.");
    } finally {
      setExplainLoading(false);
    }
  }

  if (!endpoint) {
    return (
      <aside className="admin-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Endpoint details</h2>
        <p className="muted mb-0 text-sm">Select an endpoint row to inspect method inference, params, and extraction trail.</p>
      </aside>
    );
  }

  return (
    <aside className="admin-card detail-grid min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="mb-0 text-sm font-semibold uppercase tracking-wide text-slate-400">Endpoint details</h2>
        {llmEnabled ? (
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0 border border-slate-700"
            disabled={explainLoading}
            onClick={() => void explain()}
          >
            {explainLoading ? "Explaining…" : "Explain"}
          </button>
        ) : null}
      </div>
      {explainError ? <p className="mb-0 text-sm text-rose-400">{explainError}</p> : null}
      {explanation ? (
        <div className="detail-item">
          <div className="detail-label">LLM explanation</div>
          <p className="mb-0 whitespace-pre-wrap text-sm text-slate-300">{explanation}</p>
        </div>
      ) : null}
      <div className="detail-item">
        <div className="detail-label">Resolved URL</div>
        <button type="button" className="copy-block" title={endpoint.resolvedUrl} onClick={() => copy(endpoint.resolvedUrl, "url")}>
          <span className="truncate-text">{endpoint.resolvedUrl}</span>
          <span className="copy-hint">{copied === "url" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="detail-item">
        <div className="detail-label">Method</div>
        <span className={`badge method-${endpoint.method}`}>{endpoint.method}</span>
      </div>
      <div className="detail-item">
        <div className="detail-label">Source + confidence</div>
        <div className="text-sm text-slate-300">
          {endpoint.sourceType} / {endpoint.confidence}
        </div>
      </div>
      <div className="detail-item">
        <div className="detail-label">Inferred parameters</div>
        <button type="button" className="copy-block" onClick={() => copy(endpoint.inferredParams.join(", ") || "None", "params")}>
          <span className="truncate-text">{endpoint.inferredParams.join(", ") || "None"}</span>
          <span className="copy-hint">{copied === "params" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="detail-item">
        <div className="detail-label">Inference trail</div>
        <button type="button" className="copy-block" onClick={() => copy(endpoint.inferenceTrail || "N/A", "trail")} title={endpoint.inferenceTrail}>
          <span className="truncate-text">{endpoint.inferenceTrail || "N/A"}</span>
          <span className="copy-hint">{copied === "trail" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="detail-item">
        <div className="detail-label">Raw expression</div>
        <button type="button" className="copy-button" onClick={() => copy(endpoint.rawExpression, "raw")}>
          {copied === "raw" ? "Copied raw expression" : "Copy raw expression"}
        </button>
        <pre className="code-block">{endpoint.rawExpression}</pre>
      </div>
    </aside>
  );
}
