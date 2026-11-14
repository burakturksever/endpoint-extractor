"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { EndpointRecord } from "@/lib/types/endpoints";

interface EndpointTableProps {
  endpoints: EndpointRecord[];
  onSelect: (endpoint: EndpointRecord) => void;
  onToggleCoverage?: (endpoint: EndpointRecord, covered: boolean) => void;
  renderActions?: (endpoint: EndpointRecord) => ReactNode;
}

function toEndpointPreview(url: string, max = 56): string {
  const raw = url.trim();
  if (!raw) return "";
  let display = raw;
  try {
    const parsed = new URL(raw);
    display = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    display = raw;
  }
  if (display.length <= max) {
    return display;
  }
  return `...${display.slice(-max)}`;
}

export function EndpointTable({
  endpoints,
  onSelect,
  onToggleCoverage,
  renderActions
}: EndpointTableProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [hasParams, setHasParams] = useState("ALL");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedId, setSelectedId] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const filtered = useMemo(() => {
    const searchValue = search.toLowerCase();
    const list = endpoints.filter((endpoint) => {
      const searchMatch =
        endpoint.resolvedUrl.toLowerCase().includes(searchValue) ||
        endpoint.rawExpression.toLowerCase().includes(searchValue) ||
        endpoint.inferredParams.join(",").toLowerCase().includes(searchValue);
      const methodMatch = method === "ALL" || endpoint.method === method;
      const sourceMatch = source === "ALL" || endpoint.sourceType === source;
      const confidenceMatch = confidence === "ALL" || endpoint.confidence === confidence;
      const hasParamsMatch =
        hasParams === "ALL" || (hasParams === "YES" ? endpoint.inferredParams.length > 0 : endpoint.inferredParams.length === 0);
      return searchMatch && methodMatch && sourceMatch && confidenceMatch && hasParamsMatch;
    });

    list.sort((a, b) => {
      if (sortBy === "url") {
        return a.resolvedUrl.localeCompare(b.resolvedUrl);
      }
      if (sortBy === "method") {
        return a.method.localeCompare(b.method);
      }
      if (sortBy === "confidence") {
        return a.confidence.localeCompare(b.confidence);
      }
      return b.firstSeenAt.localeCompare(a.firstSeenAt);
    });
    return list;
  }, [endpoints, search, method, source, confidence, hasParams, sortBy]);

  return (
    <section className="admin-card min-w-0">
      <h2 className="admin-card-title">Endpoints</h2>
      <div className="filters-grid">
        <input
          className="admin-input"
          placeholder="Search endpoints"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="admin-select" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="ALL">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="UNKNOWN">UNKNOWN</option>
        </select>
        <select className="admin-select" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="ALL">All Sources</option>
          <option value="network">network</option>
          <option value="static">static</option>
          <option value="promise">promise</option>
        </select>
        <select className="admin-select" value={confidence} onChange={(event) => setConfidence(event.target.value)}>
          <option value="ALL">All Confidence</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <select className="admin-select" value={hasParams} onChange={(event) => setHasParams(event.target.value)}>
          <option value="ALL">Params: all</option>
          <option value="YES">Has params</option>
          <option value="NO">No params</option>
        </select>
        <select className="admin-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="newest">Sort: newest</option>
          <option value="url">Sort: URL</option>
          <option value="method">Sort: method</option>
          <option value="confidence">Sort: confidence</option>
        </select>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            setSearch("");
            setMethod("ALL");
            setSource("ALL");
            setConfidence("ALL");
            setHasParams("ALL");
            setSortBy("newest");
          }}
        >
          Reset
        </button>
      </div>
      <p className="muted mt-1 text-sm">
        Showing {filtered.length} of {endpoints.length} endpoints
      </p>
      <div className="table-wrap mt-3 max-h-[520px] overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-method">Method</th>
              <th className="col-url">URL</th>
              <th className="w-28">Coverage</th>
              <th className="w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((endpoint) => (
              <tr
                key={endpoint.id}
                onClick={() => {
                  setSelectedId(endpoint.id);
                  onSelect(endpoint);
                }}
                className={selectedId === endpoint.id ? "row-selected" : ""}
              >
                <td>
                  <span className={`badge method-${endpoint.method}`}>{endpoint.method}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="copy-inline"
                    title={endpoint.resolvedUrl}
                    onClick={(event) => {
                      event.stopPropagation();
                      void navigator.clipboard.writeText(endpoint.resolvedUrl);
                      setCopiedId(endpoint.id);
                      setTimeout(() => setCopiedId(""), 1200);
                    }}
                  >
                    <span className="truncate-text">{toEndpointPreview(endpoint.resolvedUrl)}</span>
                    <span className="copy-hint">{copiedId === endpoint.id ? "Copied" : "Copy"}</span>
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className={`badge ${endpoint.covered ? "badge-decision-approved" : "badge-decision-pending"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCoverage?.(endpoint, !endpoint.covered);
                    }}
                  >
                    {endpoint.covered ? "covered" : "open"}
                  </button>
                </td>
                <td>{renderActions ? renderActions(endpoint) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
