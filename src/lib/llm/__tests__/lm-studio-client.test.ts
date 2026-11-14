import { beforeEach, describe, expect, it, vi } from "vitest";
import { lmStudioChatCompletion } from "@/lib/llm/lm-studio-client";

vi.mock("@/lib/runner/run-store", () => ({
  getAppSettingsForLlm: vi.fn()
}));

import { getAppSettingsForLlm } from "@/lib/runner/run-store";

describe("lmStudioChatCompletion", () => {
  beforeEach(() => {
    vi.mocked(getAppSettingsForLlm).mockReset();
    global.fetch = vi.fn(async () => {
      throw new Error("fetch not mocked");
    }) as typeof fetch;
  });

  it("throws when LLM disabled", async () => {
    vi.mocked(getAppSettingsForLlm).mockResolvedValue({
      llmEnabled: false,
      lmStudioBaseUrl: "http://127.0.0.1:1234/v1",
      lmStudioModel: "m",
      lmStudioApiKey: null
    });
    await expect(lmStudioChatCompletion({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/disabled/i);
  });

  it("posts chat completions and returns trimmed content", async () => {
    vi.mocked(getAppSettingsForLlm).mockResolvedValue({
      llmEnabled: true,
      lmStudioBaseUrl: "http://127.0.0.1:1234/v1",
      lmStudioModel: "test-model",
      lmStudioApiKey: "k"
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  pong  " } }] })
    } as Response);
    const text = await lmStudioChatCompletion({
      messages: [{ role: "user", content: "ping" }]
    });
    expect(text).toBe("pong");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer k",
          "Content-Type": "application/json"
        })
      })
    );
  });
});
