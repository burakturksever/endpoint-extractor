"use client";

import Link from "next/link";
import { useState } from "react";
import { RunForm } from "@/components/run-form";
import { TopWorkflowNav } from "@/components/top-workflow-nav";
import { setWorkflowSelection } from "@/lib/client/workflow-selection";

export default function TargetingPage(): React.ReactElement {
  const [lastBatchId, setLastBatchId] = useState("");
  const [lastRunId, setLastRunId] = useState("");

  return (
    <main className="admin-shell">
      <TopWorkflowNav />
      <header className="mb-8 border-b border-slate-800/80 pb-6">
        <h1 className="admin-page-title">Targeting</h1>
        <p className="admin-page-subtitle">Configure and start a new batch run.</p>
      </header>

      <section className="admin-card mb-6">
        <h2 className="admin-card-title">Start new batch</h2>
        <RunForm
          onBatchCreated={(batchId, runId) => {
            setLastBatchId(batchId);
            setLastRunId(runId);
            setWorkflowSelection({ batchRunId: batchId, runId });
          }}
        />
      </section>

      {lastRunId ? (
        <section className="admin-card">
          <h2 className="admin-card-title">Last created run</h2>
          <p className="muted mb-3 text-sm">Batch `{lastBatchId}` · Run `{lastRunId}`</p>
          <Link href="/endpoints" className="btn-primary btn-sm">
            Open endpoints workflow
          </Link>
        </section>
      ) : null}
    </main>
  );
}
