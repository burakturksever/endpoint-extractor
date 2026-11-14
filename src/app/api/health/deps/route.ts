import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppSettingsForLlm } from "@/lib/runner/run-store";

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { ok: boolean; message?: string }> = {
    db: { ok: false },
    llm: { ok: false }
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true };
  } catch (error) {
    checks.db = { ok: false, message: error instanceof Error ? error.message : "DB connectivity check failed." };
  }

  try {
    const settings = await getAppSettingsForLlm();
    if (!settings.llmEnabled) {
      checks.llm = { ok: true, message: "LLM disabled by settings." };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(`${settings.lmStudioBaseUrl.replace(/\/$/, "")}/models`, {
          headers: settings.lmStudioApiKey
            ? {
                Authorization: `Bearer ${settings.lmStudioApiKey}`
              }
            : undefined,
          signal: controller.signal
        });
        checks.llm = response.ok
          ? { ok: true }
          : { ok: false, message: `LM Studio /models HTTP ${response.status}` };
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    checks.llm = { ok: false, message: error instanceof Error ? error.message : "LLM connectivity check failed." };
  }

  const ok = checks.db.ok && checks.llm.ok;
  return NextResponse.json(
    {
      ok,
      checks,
      ts: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
