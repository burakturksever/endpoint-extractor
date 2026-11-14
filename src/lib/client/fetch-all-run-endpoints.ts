import type { EndpointRecord, RunState } from "@/lib/types/endpoints";

export async function fetchAllRunEndpoints(runId: string, pageSize = 300): Promise<{ run: RunState; endpoints: EndpointRecord[] }> {
  let page = 1;
  let run: RunState | null = null;
  const endpoints: EndpointRecord[] = [];

  while (true) {
    const response = await fetch(`/api/runs/${runId}?endpointPage=${page}&endpointPageSize=${pageSize}`);
    if (!response.ok) {
      throw new Error(`Failed to load run endpoints (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as { run: RunState; endpoints: EndpointRecord[] };
    run = data.run;
    endpoints.push(...data.endpoints);
    if (data.endpoints.length < pageSize) {
      break;
    }
    page += 1;
  }

  if (!run) {
    throw new Error("Run payload missing.");
  }
  return { run, endpoints };
}
