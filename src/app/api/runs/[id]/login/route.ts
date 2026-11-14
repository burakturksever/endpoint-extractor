import { NextResponse } from "next/server";
import { completeLogin } from "@/lib/runner/playwright-runner";
import { updateRun } from "@/lib/runner/run-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const completed = completeLogin(id);
  if (!completed) {
    return NextResponse.json({ error: "Run is not waiting for login confirmation." }, { status: 409 });
  }
  await updateRun(id, "running", "Login confirmed. Continuing crawl.");
  return NextResponse.json({ success: true });
}
