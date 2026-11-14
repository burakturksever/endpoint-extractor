"use client";

import { useMemo, useState } from "react";
import type { RelativeUrlResolveCandidate } from "@/lib/repeater/relative-url-resolver";

interface RepeaterRelativeUrlDialogProps {
  open: boolean;
  relativeUrl: string;
  candidates: RelativeUrlResolveCandidate[];
  onCancel: () => void;
  onConfirm: (url: string) => void;
}

export function RepeaterRelativeUrlDialog({
  open,
  relativeUrl,
  candidates,
  onCancel,
  onConfirm
}: RepeaterRelativeUrlDialogProps): React.ReactElement | null {
  const initial = useMemo(() => candidates[0]?.resolvedUrl ?? "", [candidates]);
  const [selected, setSelected] = useState("");
  const selectedValue = selected || initial;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-100">Relative URL detected</h3>
        <p className="mt-2 text-sm text-slate-300">
          Relative URLs are not supported directly. Attempt to resolve absolute URL for <span className="font-mono">{relativeUrl}</span>?
        </p>
        <div className="mt-3 space-y-2">
          {candidates.map((candidate) => (
            <label key={`${candidate.source}:${candidate.resolvedUrl}`} className="flex items-start gap-2 rounded border border-slate-700 p-2 text-sm">
              <input
                type="radio"
                name="relative-url-candidate"
                  checked={selectedValue === candidate.resolvedUrl}
                onChange={() => setSelected(candidate.resolvedUrl)}
              />
              <span className="min-w-0">
                <span className="block break-all font-mono text-xs text-slate-200">{candidate.resolvedUrl}</span>
                <span className="text-xs text-slate-400">Source: {candidate.source}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!selectedValue} onClick={() => onConfirm(selectedValue)}>
            Use selected URL
          </button>
        </div>
      </div>
    </div>
  );
}
