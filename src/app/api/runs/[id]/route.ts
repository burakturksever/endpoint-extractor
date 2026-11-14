import { NextResponse } from "next/server";
import { getRunWithEndpoints } from "@/lib/runner/run-store";
import { parsePageRequest } from "@/lib/api/pagination";
import { logger } from "@/lib/observability/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const url = new URL(_.url);
  const pagination = parsePageRequest({
    pageParam: url.searchParams.get("endpointPage"),
    pageSizeParam: url.searchParams.get("endpointPageSize"),
    defaultPage: 1,
    defaultPageSize: 200,
    minPageSize: 20,
    maxPageSize: 300
  });
  const data = await getRunWithEndpoints(id, {
    endpointPage: pagination.page,
    endpointPageSize: pagination.pageSize
  });
  if (!data) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  logger.info("run.page.loaded", {
    runId: id,
    page: pagination.page,
    pageSize: pagination.pageSize,
    endpointsReturned: data.endpoints.length
  });
  return NextResponse.json(data);
}
