import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/runs/[id]/route";

vi.mock("@/lib/runner/run-store", () => ({
  getRunWithEndpoints: vi.fn()
}));

import { getRunWithEndpoints } from "@/lib/runner/run-store";

describe("GET /api/runs/[id]", () => {
  it("returns 404 when run is missing", async () => {
    vi.mocked(getRunWithEndpoints).mockResolvedValueOnce(null);
    const request = new Request("http://localhost/api/runs/r1");
    const response = await GET(request, { params: Promise.resolve({ id: "r1" }) });
    expect(response.status).toBe(404);
  });

  it("passes sanitized pagination to store", async () => {
    vi.mocked(getRunWithEndpoints).mockResolvedValueOnce({
      run: {
        id: "r1",
        status: "running",
        message: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      endpoints: []
    });
    const request = new Request("http://localhost/api/runs/r1?endpointPage=-5&endpointPageSize=999");
    const response = await GET(request, { params: Promise.resolve({ id: "r1" }) });
    expect(response.status).toBe(200);
    expect(getRunWithEndpoints).toHaveBeenCalledWith("r1", {
      endpointPage: 1,
      endpointPageSize: 300
    });
  });
});
