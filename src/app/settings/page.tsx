"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AppSettingsState } from "@/lib/types/endpoints";

export default function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<AppSettingsState | null>(null);
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState("");
  const [lmStudioModel, setLmStudioModel] = useState("");
  const [lmStudioApiKey, setLmStudioApiKey] = useState("");
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings");
        const data = (await response.json()) as { settings?: AppSettingsState };
        if (data.settings) {
          setSettings(data.settings);
          setLlmEnabled(data.settings.llmEnabled);
          setLmStudioBaseUrl(data.settings.lmStudioBaseUrl);
          setLmStudioModel(data.settings.lmStudioModel);
          setLmStudioApiKey("");
        }
      } catch {
        setError("Could not load settings.");
      }
    })();
  }, []);

  async function save(partial: Partial<{ llmEnabled: boolean; lmStudioBaseUrl: string; lmStudioModel: string; lmStudioApiKey: string | null }>): Promise<void> {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial)
      });
      const data = (await response.json()) as { settings?: AppSettingsState; error?: unknown };
      if (!response.ok || !data.settings) {
        const flat = data.error as { fieldErrors?: Record<string, string[]> } | undefined;
        const zodMsg = flat?.fieldErrors ? JSON.stringify(flat.fieldErrors) : "";
        throw new Error(
          typeof data.error === "string" ? data.error : zodMsg.length > 0 ? zodMsg : "Save failed."
        );
      }
      setSettings(data.settings);
      setLlmEnabled(data.settings.llmEnabled);
      setLmStudioBaseUrl(data.settings.lmStudioBaseUrl);
      setLmStudioModel(data.settings.lmStudioModel);
      if (partial.lmStudioApiKey !== undefined) {
        setLmStudioApiKey("");
      }
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(): Promise<void> {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/llm-test", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "Test failed.");
      }
      setNotice(`Connection OK. Model reply: ${data.message ?? ""}`.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="admin-page-title">Settings</h1>
          <p className="admin-page-subtitle mb-0">
            LM Studio exposes an OpenAI-compatible API (default <code className="text-slate-300">http://127.0.0.1:1234/v1</code>). Run LM
            Studio locally, load <strong className="font-medium text-slate-200">Qwen2.5-7B-Instruct</strong> in <strong className="font-medium text-slate-200">Q4_K_M</strong> (or similar), and match the{" "}
            <strong className="font-medium text-slate-200">model id</strong> shown in LM Studio.
          </p>
        </div>
        <Link href="/" className="btn-ghost btn-sm shrink-0 border border-slate-700">
          Back to dashboard
        </Link>
      </header>

      <section className="admin-card max-w-3xl space-y-5">
        <h2 className="admin-card-title">LLM &amp; LM Studio</h2>
        {!llmEnabled ? (
          <p className="muted mb-0 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-sm">
            With LLM features off, the app runs exactly as before: no outbound calls to LM Studio.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            className="admin-checkbox mt-0.5"
            checked={llmEnabled}
            onChange={(event) => {
              const next = event.target.checked;
              setLlmEnabled(next);
              void save({ llmEnabled: next });
            }}
            disabled={saving || !settings}
          />
          <span>Enable LLM features (master switch)</span>
        </label>

        <div>
          <label className="admin-label" htmlFor="lmStudioBaseUrl">
            Base URL
          </label>
          <input
            id="lmStudioBaseUrl"
            className="admin-input"
            value={lmStudioBaseUrl}
            onChange={(event) => setLmStudioBaseUrl(event.target.value)}
            disabled={!settings}
            placeholder="http://127.0.0.1:1234/v1"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="lmStudioModel">
            Model id
          </label>
          <input
            id="lmStudioModel"
            className="admin-input"
            value={lmStudioModel}
            onChange={(event) => setLmStudioModel(event.target.value)}
            disabled={!settings}
            placeholder="qwen2.5-7b-instruct"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="lmStudioApiKey">
            API key (optional)
          </label>
          <input
            id="lmStudioApiKey"
            type="password"
            className="admin-input"
            value={lmStudioApiKey}
            onChange={(event) => setLmStudioApiKey(event.target.value)}
            disabled={!settings}
            placeholder={settings?.hasLmStudioApiKey ? "•••••••• (leave blank to keep)" : "Usually empty for local LM Studio"}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !settings}
            onClick={() =>
              void save({
                lmStudioBaseUrl,
                lmStudioModel,
                ...(lmStudioApiKey.length > 0 ? { lmStudioApiKey } : {})
              })
            }
          >
            {saving ? "Saving…" : "Save connection"}
          </button>
          {settings?.hasLmStudioApiKey ? (
            <button
              type="button"
              className="btn-ghost btn-sm border border-slate-700"
              disabled={saving || !settings}
              onClick={() => void save({ lmStudioApiKey: null })}
            >
              Clear API key
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost btn-sm border border-slate-700"
            disabled={testing || !settings || !llmEnabled}
            onClick={() => void testConnection()}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {error ? <p className="mb-0 text-sm text-rose-400">{error}</p> : null}
        {notice ? <p className="mb-0 text-sm text-emerald-400">{notice}</p> : null}
      </section>
    </main>
  );
}
