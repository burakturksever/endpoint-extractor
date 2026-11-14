"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RepeaterRelativeUrlDialog } from "@/components/repeater-relative-url-dialog";
import { normalizeHttpUrlForRepeater } from "@/lib/repeater/request-normalization";
import { resolveRelativeUrlCandidates } from "@/lib/repeater/relative-url-resolver";
import type { EndpointRecord, RepeaterRequestRecord } from "@/lib/types/endpoints";

interface SendToRepeaterButtonProps {
  endpoint: EndpointRecord;
  className?: string;
}

export function SendToRepeaterButton({ endpoint, className }: SendToRepeaterButtonProps): React.ReactElement {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [resolverOpen, setResolverOpen] = useState(false);
  const [resolverCandidates, setResolverCandidates] = useState<ReturnType<typeof resolveRelativeUrlCandidates>["candidates"]>([]);
  const [relativeUrl, setRelativeUrl] = useState("");

  async function createRepeaterRequest(normalizedUrl: string): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/repeater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: endpoint.runId,
          endpointId: endpoint.id,
          method: endpoint.method,
          url: normalizedUrl,
          headers: ""
        })
      });
      const data = (await response.json()) as { request?: RepeaterRequestRecord; error?: string; details?: unknown };
      if (!response.ok || !data.request) {
        const msg = typeof data.error === "string" ? data.error : "Failed to create repeater request.";
        throw new Error(msg);
      }
      router.push(`/repeater?runId=${encodeURIComponent(endpoint.runId)}&requestId=${encodeURIComponent(data.request.id)}`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to send to Repeater.");
    } finally {
      setLoading(false);
    }
  }

  async function sendToRepeater(): Promise<void> {
    if (loading) return;
    setLocalError("");
    const normalized = normalizeHttpUrlForRepeater(endpoint.resolvedUrl);
    if (!normalized.ok) {
      if (normalized.code === "relative_url") {
        const resolved = resolveRelativeUrlCandidates({
          relativeUrl: endpoint.resolvedUrl,
          endpoint: { originUrl: endpoint.originUrl, pageUrl: endpoint.pageUrl }
        });
        if (resolved.canResolve) {
          setRelativeUrl(endpoint.resolvedUrl);
          setResolverCandidates(resolved.candidates);
          setResolverOpen(true);
          return;
        }
      }
      setLocalError(normalized.error);
      return;
    }
    await createRepeaterRequest(normalized.url);
  }

  return (
    <>
      <span className="inline-flex flex-col items-end gap-0.5">
        <button type="button" className={className ?? "btn-secondary btn-sm"} disabled={loading} onClick={() => void sendToRepeater()}>
          {loading ? "Sending…" : "Send to Repeater"}
        </button>
        {localError ? <span className="max-w-[14rem] text-right text-[10px] leading-tight text-rose-400">{localError}</span> : null}
      </span>
      <RepeaterRelativeUrlDialog
        key={`${relativeUrl}:${resolverCandidates[0]?.resolvedUrl ?? ""}`}
        open={resolverOpen}
        relativeUrl={relativeUrl}
        candidates={resolverCandidates}
        onCancel={() => {
          setResolverOpen(false);
          setLocalError("Relative URLs are not supported; use a full URL or an endpoint whose resolved URL is absolute.");
        }}
        onConfirm={(resolvedUrl) => {
          setResolverOpen(false);
          setLocalError("");
          void createRepeaterRequest(resolvedUrl);
        }}
      />
    </>
  );
}
