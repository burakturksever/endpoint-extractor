import { describe, expect, it } from "vitest";
import { batchTargetSummary, formatSeedUrlForDisplay, runSelectDisplayLabel } from "@/lib/ui/format-seed-url";

describe("formatSeedUrlForDisplay", () => {
  it("uses origin and path without query", () => {
    expect(formatSeedUrlForDisplay("https://a.com/foo?utm=1")).toBe("https://a.com/foo");
  });

  it("returns origin only for bare root", () => {
    expect(formatSeedUrlForDisplay("https://a.com/")).toBe("https://a.com");
  });
});

describe("runSelectDisplayLabel", () => {
  it("disambiguates duplicate seed and status", () => {
    const runs = [
      { id: "run-aaaaaa", targetUrl: "https://x.com/a", status: "completed" },
      { id: "run-bbbbbb", targetUrl: "https://x.com/a", status: "completed" }
    ];
    const a = runSelectDisplayLabel(runs[0], runs);
    const b = runSelectDisplayLabel(runs[1], runs);
    expect(a).toContain("completed");
    expect(b).toContain("completed");
    expect(a).not.toBe(b);
  });
});

describe("batchTargetSummary", () => {
  it("summarizes multiple unique targets", () => {
    expect(batchTargetSummary(["https://a.com", "https://b.com", "https://c.com"])).toMatch(/\+1/);
  });
});
