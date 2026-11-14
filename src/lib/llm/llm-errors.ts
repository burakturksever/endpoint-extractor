export type LlmErrorCode = "disabled" | "timeout" | "truncated" | "invalid_json" | "http_error" | "empty_response" | "unknown";

export class LlmError extends Error {
  code: LlmErrorCode;

  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function classifyLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) {
    return error;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("disabled")) return new LlmError("disabled", error.message);
    if (msg.includes("timed out") || msg.includes("abort")) return new LlmError("timeout", error.message);
    if (msg.includes("truncated")) return new LlmError("truncated", error.message);
    if (msg.includes("invalid json")) return new LlmError("invalid_json", error.message);
    if (msg.includes("http")) return new LlmError("http_error", error.message);
    if (msg.includes("empty")) return new LlmError("empty_response", error.message);
    return new LlmError("unknown", error.message);
  }
  return new LlmError("unknown", "Unknown LLM error.");
}

export function llmErrorHttpStatus(code: LlmErrorCode): number {
  if (code === "disabled") return 403;
  if (code === "invalid_json" || code === "truncated" || code === "empty_response") return 502;
  if (code === "timeout") return 504;
  return 502;
}
