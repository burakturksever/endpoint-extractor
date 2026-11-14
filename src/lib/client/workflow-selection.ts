const BATCH_KEY = "ee.activeBatchRunId";
const RUN_KEY = "ee.activeRunId";

export interface WorkflowSelection {
  batchRunId: string;
  runId: string;
}

function dispatchSelectionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ee-workflow-selection"));
}

export function getWorkflowSelection(): WorkflowSelection | null {
  if (typeof sessionStorage === "undefined") return null;
  const batchRunId = sessionStorage.getItem(BATCH_KEY) ?? "";
  const runId = sessionStorage.getItem(RUN_KEY) ?? "";
  if (!runId) return null;
  return { batchRunId, runId };
}

export function setWorkflowSelection(sel: Partial<WorkflowSelection>): void {
  if (typeof sessionStorage === "undefined") return;
  if (sel.batchRunId !== undefined) {
    if (sel.batchRunId) sessionStorage.setItem(BATCH_KEY, sel.batchRunId);
    else sessionStorage.removeItem(BATCH_KEY);
  }
  if (sel.runId !== undefined) {
    if (sel.runId) sessionStorage.setItem(RUN_KEY, sel.runId);
    else sessionStorage.removeItem(RUN_KEY);
  }
  dispatchSelectionChanged();
}

export function clearWorkflowSelection(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(BATCH_KEY);
  sessionStorage.removeItem(RUN_KEY);
  dispatchSelectionChanged();
}
