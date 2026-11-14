import { describe, expect, it } from "vitest";
import { parsePageRequest } from "@/lib/api/pagination";

describe("parsePageRequest", () => {
  it("returns defaults when params missing", () => {
    const page = parsePageRequest({ pageParam: null, pageSizeParam: null, defaultPage: 1, defaultPageSize: 200 });
    expect(page).toEqual({ page: 1, pageSize: 200 });
  });

  it("clamps page and pageSize to configured bounds", () => {
    const page = parsePageRequest({
      pageParam: "-3",
      pageSizeParam: "999",
      defaultPage: 1,
      defaultPageSize: 200,
      minPageSize: 20,
      maxPageSize: 300
    });
    expect(page).toEqual({ page: 1, pageSize: 300 });
  });
});
