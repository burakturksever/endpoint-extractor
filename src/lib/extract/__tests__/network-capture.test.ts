import { describe, expect, it } from "vitest";
import { fromRequest } from "@/lib/extract/network-capture";

describe("fromRequest", () => {
  it("extracts query and form params", () => {
    const request = {
      method: () => "POST",
      url: () => "https://example.com/api/v1/user?id=12",
      postData: () => "tenantId=1&userId=55",
      headers: () => ({ "content-type": "application/x-www-form-urlencoded" })
    } as never;
    const candidate = fromRequest(request);
    expect(candidate.method).toBe("POST");
    expect(candidate.inferredParams).toEqual(expect.arrayContaining(["id", "tenantId", "userId"]));
  });
});
