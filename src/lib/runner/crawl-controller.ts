import type { Page } from "playwright";

export interface CrawlNode {
  url: string;
  depth: number;
}

export interface CrawlFrontierConfig {
  maxPages: number;
  maxDepth: number;
  isAllowed: (url: string) => boolean;
}

export interface DiscoveryResult {
  links: string[];
  routerHints: string[];
}

export class CrawlFrontier {
  private readonly queue: CrawlNode[] = [];
  private readonly visited = new Set<string>();
  private readonly maxPages: number;
  private readonly maxDepth: number;
  private readonly isAllowed: (url: string) => boolean;

  constructor(startUrl: string, config: CrawlFrontierConfig) {
    this.maxPages = config.maxPages;
    this.maxDepth = config.maxDepth;
    this.isAllowed = config.isAllowed;
    this.enqueue({ url: startUrl, depth: 0 });
  }

  enqueue(node: CrawlNode): void {
    if (node.depth > this.maxDepth) {
      return;
    }
    const fingerprint = normalizeForVisit(node.url);
    if (this.visited.has(fingerprint)) {
      return;
    }
    if (!this.isAllowed(node.url)) {
      return;
    }
    this.queue.push(node);
  }

  next(): CrawlNode | null {
    if (this.visited.size >= this.maxPages) {
      return null;
    }
    while (this.queue.length > 0) {
      const nextNode = this.queue.shift()!;
      const fingerprint = normalizeForVisit(nextNode.url);
      if (this.visited.has(fingerprint)) {
        continue;
      }
      this.visited.add(fingerprint);
      return nextNode;
    }
    return null;
  }

  size(): number {
    return this.visited.size;
  }
}

export async function discoverNavigationTargets(page: Page, isAllowed: (url: string) => boolean): Promise<DiscoveryResult> {
  const data = await page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll("a[href]"))
      .map((node) => (node as HTMLAnchorElement).href)
      .filter(Boolean);
    const forms = Array.from(document.querySelectorAll("form[action]"))
      .map((form) => (form as HTMLFormElement).action)
      .filter(Boolean);
    const routerHints = Array.from(document.querySelectorAll("[data-route], [data-path]"))
      .map((node) => (node.getAttribute("data-route") || node.getAttribute("data-path") || "").trim())
      .filter(Boolean);

    return {
      hrefs,
      forms,
      routerHints
    };
  });

  const links = new Set<string>();
  for (const candidate of [...data.hrefs, ...data.forms]) {
    if (!isAllowed(candidate)) {
      continue;
    }
    links.add(candidate.split("#")[0]);
  }
  for (const hint of data.routerHints) {
    const normalized = hint.startsWith("http") ? hint : `${page.url().split("/").slice(0, 3).join("/")}${hint.startsWith("/") ? hint : `/${hint}`}`;
    if (isAllowed(normalized)) {
      links.add(normalized.split("#")[0]);
    }
  }

  return {
    links: Array.from(links),
    routerHints: data.routerHints
  };
}

function normalizeForVisit(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0]?.split("#")[0] ?? url;
  }
}
