"use client";

import { useEffect, useState } from "react";
import { clearWorkflowSelection, getWorkflowSelection } from "@/lib/client/workflow-selection";
import type { BatchRunState, RunState } from "@/lib/types/endpoints";

export function WorkflowSelectionChip(): React.ReactElement | null {
  const [batchLabel, setBatchLabel] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [visible, setVisible] = useState(false);

  async function refresh(): Promise<void> {
    const sel = getWorkflowSelection();
    if (!sel?.runId) {
      setVisible(false);
      return;
    }
    setVisible(true);
    try {
      const [runsRes, batchesRes] = await Promise.all([fetch("/api/runs"), fetch("/api/batches")]);
      const runsData = (await runsRes.json()) as { runs: RunState[] };
      const batchesData = (await batchesRes.json()) as { batches: BatchRunState[] };
      const run = runsData.runs.find((r) => r.id === sel.runId);
      const batch =
        sel.batchRunId.length > 0 ? batchesData.batches.find((b) => b.id === sel.batchRunId) : undefined;
      setRunLabel(run?.targetUrl ?? sel.runId);
      setBatchLabel(batch?.targetSummary ?? (sel.batchRunId.length > 0 ? sel.batchRunId : "—"));
    } catch {
      setRunLabel(sel.runId);
      setBatchLabel(sel.batchRunId.length > 0 ? sel.batchRunId : "—");
    }
  }

  useEffect(() => {
    const schedule = (): void => queueMicrotask(() => void refresh());
    schedule();
    const onChange = (): void => schedule();
    window.addEventListener("ee-workflow-selection", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("ee-workflow-selection", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
      <span className="font-medium text-slate-300">Workflow</span>
      <span className="max-w-[min(28vw,200px)] truncate" title={batchLabel}>
        Batch: {batchLabel}
      </span>
      <span className="text-slate-600">·</span>
      <span className="max-w-[min(44vw,320px)] truncate font-mono text-[11px]" title={runLabel}>
        Run: {runLabel}
      </span>
      <button
        type="button"
        className="btn-ghost btn-sm ml-auto border border-slate-700 py-0.5 text-[11px]"
        onClick={() => {
          clearWorkflowSelection();
          void refresh();
        }}
      >
        Clear
      </button>
    </div>
  );
}
