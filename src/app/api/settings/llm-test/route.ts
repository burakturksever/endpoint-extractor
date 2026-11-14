import { NextResponse } from "next/server";
import { getAppSettingsForLlm } from "@/lib/runner/run-store";
import { lmStudioChatCompletion } from "@/lib/llm/lm-studio-client";

export async function POST(): Promise<NextResponse> {
  const settings = await getAppSettingsForLlm();
  if (!settings.llmEnabled) {
    return NextResponse.json({ ok: false, message: "Enable LLM features in settings before testing." }, { status: 400 });
  }
  try {
    const reply = await lmStudioChatCompletion({
      messages: [
        { role: "system", content: "Reply with exactly: ok" },
        { role: "user", content: "connection test" }
      ],
      maxTokens: 8,
      temperature: 0
    });
    return NextResponse.json({ ok: true, message: reply.slice(0, 200) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
