import { NextResponse } from "next/server";
import { getBatchWithRuns } from "@/lib/runner/run-store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const data = await getBatchWithRuns(id);
  if (!data) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
