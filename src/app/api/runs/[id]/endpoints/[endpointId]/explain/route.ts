import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { classifyLlmError, llmErrorHttpStatus } from "@/lib/llm/llm-errors";
import { getEndpointForRun, getAppSettingsForLlm } from "@/lib/runner/run-store";
import { lmStudioChatJson } from "@/lib/llm/lm-studio-client";

interface RouteContext {
  params: Promise<{ id: string; endpointId: string }>;
}

export async function POST(_: Request, context: RouteContext): Promise<NextResponse> {
  const { id: runId, endpointId } = await context.params;
  const rl = checkRateLimit({ key: `explain:${runId}`, windowMs: 60_000, maxRequests: 30 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many explain requests.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }
  const settings = await getAppSettingsForLlm();
  if (!settings.llmEnabled) {
    return NextResponse.json({ error: "LLM features are disabled." }, { status: 403 });
  }
  const endpoint = await getEndpointForRun(runId, endpointId);
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  }
  const raw =
    endpoint.rawExpression.length > 4000
      ? `${endpoint.rawExpression.slice(0, 4000)}…`
      : endpoint.rawExpression;
  const payload = {
    resolvedUrl: endpoint.resolvedUrl,
    method: endpoint.method,
    sourceType: endpoint.sourceType,
    confidence: endpoint.confidence,
    pageUrl: endpoint.pageUrl,
    originUrl: endpoint.originUrl,
    inferenceTrail: endpoint.inferenceTrail,
    inferredParams: endpoint.inferredParams,
    rawExpression: raw
  };
  try {
    const parsed = await lmStudioChatJson<{ explanation?: string }>(
      "You help engineers understand HTTP endpoints discovered by static analysis and network capture. Be concise and practical.",
      `Explain this discovered endpoint in 2–4 short paragraphs for an engineer. Output JSON only.\n${JSON.stringify(payload)}`,
      '{"explanation":"string"}'
    );
    const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    if (!explanation) {
      return NextResponse.json({ error: "Model returned an empty explanation." }, { status: 502 });
    }
    return NextResponse.json({ explanation });
  } catch (error) {
    const classified = classifyLlmError(error);
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: llmErrorHttpStatus(classified.code) });
  }
}
