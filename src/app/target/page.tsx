"use client";

import { useEffect, useMemo, useState } from "react";
import { EndpointDetailDrawer } from "@/components/endpoint-detail-drawer";
import { SendToRepeaterButton } from "@/components/send-to-repeater-button";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { fetchAllRunEndpoints } from "@/lib/client/fetch-all-run-endpoints";
import { getWorkflowSelection, setWorkflowSelection } from "@/lib/client/workflow-selection";
import { buildTargetTree, type TargetTreeNode } from "@/lib/target/tree";
import type { EndpointRecord, RunState } from "@/lib/types/endpoints";

function TreeNodeRow(props: {
  node: TargetTreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelectEndpoint: (endpoint: EndpointRecord) => void;
}): React.ReactElement {
  const { node, expanded, onToggle, onSelectEndpoint } = props;
  const isOpen = expanded.has(node.id);
  return (
    <li className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded border border-slate-800/70 px-2 py-1.5 text-left text-sm hover:bg-slate-900/50"
        onClick={() => onToggle(node.id)}
      >
        <span className="w-4 text-slate-500">{node.children.length > 0 ? (isOpen ? "▾" : "▸") : "•"}</span>
        <span className="font-mono text-slate-200">{node.segment}</span>
        <span className="text-xs text-slate-500">{node.endpoints.length > 0 ? `${node.endpoints.length} endpoint(s)` : ""}</span>
      </button>
      {isOpen ? (
        <div className="ml-6 space-y-2">
          {node.endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex items-center gap-2 rounded border border-slate-800/70 bg-slate-950/30 px-2 py-1.5"
            >
              <button type="button" className={`badge method-${endpoint.method}`} onClick={() => onSelectEndpoint(endpoint)}>
                {endpoint.method}
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-mono text-xs text-slate-300"
                title={endpoint.resolvedUrl}
                onClick={() => onSelectEndpoint(endpoint)}
              >
                {endpoint.resolvedUrl}
              </button>
              <SendToRepeaterButton endpoint={endpoint} />
            </div>
          ))}
          {node.children.length > 0 ? (
            <ul className="space-y-2">
              {node.children.map((child) => (
                <TreeNodeRow key={child.id} node={child} expanded={expanded} onToggle={onToggle} onSelectEndpoint={onSelectEndpoint} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function TargetPage(): React.ReactElement {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState("");
  const [search, setSearch] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    if (!runId) {
      return;
    }
    setWorkflowSelection({ runId });
    void (async () => {
      const data = await fetchAllRunEndpoints(runId);
      setEndpoints(data.endpoints);
    })();
  }, [runId]);

  const tree = useMemo(() => buildTargetTree(endpoints), [endpoints]);
  const filteredTree = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tree;
    const filterNode = (node: TargetTreeNode): TargetTreeNode | null => {
      const matchedChildren = node.children.map(filterNode).filter((x): x is TargetTreeNode => x !== null);
      const matchedEndpoints = node.endpoints.filter((ep) => ep.resolvedUrl.toLowerCase().includes(query));
      const selfMatch = node.segment.toLowerCase().includes(query) || node.fullPath.toLowerCase().includes(query);
      if (!selfMatch && matchedChildren.length === 0 && matchedEndpoints.length === 0) return null;
      return { ...node, children: matchedChildren, endpoints: matchedEndpoints };
    };
    return tree.map(filterNode).filter((x): x is TargetTreeNode => x !== null);
  }, [search, tree]);

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">Target</h1>
        <p className="admin-page-subtitle">Explore endpoints as a hierarchical path tree.</p>
      </header>
      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Target explorer</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="max-w-xl">
            <label htmlFor="target-run" className="admin-label">
              Run
            </label>
            <select
              id="target-run"
              className="admin-select"
              value={runId}
              onChange={(event) => {
                const next = event.target.value;
                setRunId(next);
                if (next) {
                  setWorkflowSelection({ runId: next });
              } else {
                setEndpoints([]);
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
          <div>
            <label htmlFor="target-search" className="admin-label">
              Filter tree
            </label>
            <input
              id="target-search"
              className="admin-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="user, group, /api, getInfo"
            />
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <section className="admin-card min-w-0">
          <h2 className="admin-card-title">Hierarchy</h2>
          {filteredTree.length === 0 ? <p className="muted mb-0 text-sm">No nodes for this run/filter.</p> : null}
          <ul className="space-y-2">
            {filteredTree.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onSelectEndpoint={setSelectedEndpoint}
              />
            ))}
          </ul>
        </section>

        <EndpointDetailDrawer key={selectedEndpoint?.id ?? "none"} endpoint={selectedEndpoint} llmEnabled />
      </section>
    </main>
  );
}
