import { describe, expect, it } from "vitest";
import { CRAWL_PRACTICAL_INFINITE_MAX_PAGES, effectiveCrawlMaxPages } from "@/lib/runner/crawl-limits";

describe("effectiveCrawlMaxPages", () => {
  it("returns nominal cap when not unlimited", () => {
    expect(effectiveCrawlMaxPages(42, false)).toBe(42);
    expect(effectiveCrawlMaxPages(0, false)).toBe(1);
  });

  it("returns practical infinite cap when unlimited", () => {
    expect(effectiveCrawlMaxPages(10, true)).toBe(CRAWL_PRACTICAL_INFINITE_MAX_PAGES);
  });
});
