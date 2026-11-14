import { describe, expect, it } from "vitest";
import { CrawlPolicyEngine } from "@/lib/runner/crawl-policy";

describe("CrawlPolicyEngine", () => {
  const policy = new CrawlPolicyEngine({
    seedUrl: "https://app.example.com",
    approvedDomains: ["exampleapp.com"]
  });

  it("allows same origin links", () => {
    const result = policy.decide("https://app.example.com/dashboard");
    expect(result.allowed).toBe(true);
  });

  it("allows same registrable domain subdomains", () => {
    const result = policy.decide("https://cdn.example.com/static/app.js");
    expect(result.allowed).toBe(true);
    expect(result.discoveredDomain).toBe("cdn.example.com");
  });

  it("blocks unrelated domains unless approved", () => {
    const blocked = policy.decide("https://instagram.com/example");
    expect(blocked.allowed).toBe(false);
    const approved = policy.decide("https://api.exampleapp.com/v1");
    expect(approved.allowed).toBe(true);
  });
});
