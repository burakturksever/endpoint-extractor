import { LlmError } from "@/lib/llm/llm-errors";
import { getAppSettingsForLlm } from "@/lib/runner/run-store";

const DEFAULT_CHAT_TIMEOUT_MS = 35_000;

function normalizeLmStudioApiBase(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

export async function lmStudioChatCompletion(params: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const settings = await getAppSettingsForLlm();
  if (!settings.llmEnabled) {
    throw new LlmError("disabled", "LLM features are disabled.");
  }
  const base = normalizeLmStudioApiBase(settings.lmStudioBaseUrl);
  const url = `${base}/chat/completions`;
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.lmStudioApiKey && settings.lmStudioApiKey.length > 0) {
      headers.Authorization = `Bearer ${settings.lmStudioApiKey}`;
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.lmStudioModel,
          messages: params.messages,
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens ?? 1024,
          stream: false
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmError("timeout", `LM Studio request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new LlmError("http_error", `LM Studio HTTP ${response.status}: ${body.slice(0, 240)}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
    };
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      throw new LlmError("truncated", "LM Studio response was truncated (finish_reason=length).");
    }
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmError("empty_response", "Empty LLM response.");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function lmStudioChatJson<T>(
  system: string,
  user: string,
  schemaHint: string,
  maxTokens?: number,
  timeoutMs?: number
): Promise<T> {
  const text = await lmStudioChatCompletion({
    messages: [
      { role: "system", content: `${system}\nRespond with JSON only. Shape: ${schemaHint}` },
      { role: "user", content: user }
    ],
    temperature: 0.1,
    maxTokens: maxTokens ?? 2048,
    timeoutMs
  });
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new LlmError("invalid_json", "LLM returned invalid JSON.");
  }
}
