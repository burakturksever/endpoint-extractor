"use client";

import { useState } from "react";

interface RunFormProps {
  onBatchCreated: (batchId: string, firstRunId: string) => void;
}

export function RunForm({ onBatchCreated }: RunFormProps): React.ReactElement {
  const [targetUrls, setTargetUrls] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [unlimitedPages, setUnlimitedPages] = useState(false);
  const [maxDepth, setMaxDepth] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const urlList = targetUrls
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrls: urlList,
          loginUrl: loginUrl || undefined,
          maxPages,
          unlimitedPages,
          maxDepth,
          concurrency,
          retryCount: 1
        })
      });
      const data = (await response.json()) as { batch?: { id: string }; runs?: Array<{ id: string }>; error?: unknown };
      if (!response.ok || !data.batch || !data.runs?.length) {
        throw new Error("Failed to start run.");
      }
      onBatchCreated(data.batch.id, data.runs[0].id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <label className="admin-label" htmlFor="targetUrls">
            Target URLs (one per line)
          </label>
          <textarea
            id="targetUrls"
            className="admin-textarea"
            required
            placeholder={"https://example.com\nhttps://app.example.com"}
            value={targetUrls}
            onChange={(event) => setTargetUrls(event.target.value)}
            rows={5}
          />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <label className="admin-label" htmlFor="loginUrl">
            Login URL (optional)
          </label>
          <input
            id="loginUrl"
            className="admin-input"
            placeholder="https://example.com/login"
            value={loginUrl}
            onChange={(event) => setLoginUrl(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-12">
        <div className="min-w-0 sm:col-span-1 lg:col-span-2">
          <label className="admin-label" htmlFor="maxPages">
            Max pages
          </label>
          <input
            id="maxPages"
            className="admin-input"
            type="number"
            min={1}
            max={300}
            disabled={unlimitedPages}
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value))}
          />
        </div>
        <div className="min-w-0 sm:col-span-1 lg:col-span-2">
          <label className="admin-label" htmlFor="concurrency">
            Concurrency
          </label>
          <input
            id="concurrency"
            className="admin-input"
            type="number"
            min={1}
            max={8}
            value={concurrency}
            onChange={(event) => setConcurrency(Number(event.target.value))}
          />
        </div>
        <div className="min-w-0 sm:col-span-1 lg:col-span-2">
          <label className="admin-label" htmlFor="maxDepth">
            Max depth
          </label>
          <input
            id="maxDepth"
            className="admin-input"
            type="number"
            min={1}
            max={8}
            value={maxDepth}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
          />
        </div>
        <div className="col-span-2 flex sm:col-span-1 lg:col-span-6 lg:justify-end">
          <button type="submit" className="btn-primary w-full sm:w-auto lg:min-w-[140px]" disabled={loading}>
            {loading ? "Starting…" : "Start batch"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 border-t border-slate-800/80 pt-4">
        <label className="flex max-w-md cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="admin-checkbox mt-0.5"
            checked={unlimitedPages}
            onChange={(event) => setUnlimitedPages(event.target.checked)}
          />
          <span>
            Unlimited pages (within crawl policy). Uses a high internal cap so runs still finish; depth and allowed domains
            still apply.
          </span>
        </label>
      </div>

      {error ? <p className="mb-0 text-sm text-rose-400">{error}</p> : null}
    </form>
  );
}
