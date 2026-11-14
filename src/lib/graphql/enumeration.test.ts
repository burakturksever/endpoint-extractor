import { afterEach, describe, expect, it, vi } from "vitest";
import { enumerateGraphqlEndpoint } from "@/lib/graphql/enumeration";

describe("enumerateGraphqlEndpoint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects introspection + typename support", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { __typename: "Query" } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              __schema: {
                queryType: { name: "Query" },
                mutationType: null,
                subscriptionType: null,
                types: [{ name: "Query" }, { name: "User" }]
              }
            }
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { __typename: "Query" } })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await enumerateGraphqlEndpoint({
      endpointUrl: "https://api.example.com/graphql",
      operation: "query { __typename }",
      variablesJson: "{}"
    });
    expect(out.ok).toBe(true);
    expect(out.introspectionAvailable).toBe(true);
    expect(out.typenameProbeOk).toBe(true);
    expect(out.schema?.queryType).toBe("Query");
  });
});
