import { chromium, type Browser, type BrowserContext } from "playwright";
import { extractStaticCandidates } from "@/lib/extract/js-static-analysis";
import { normalizeEndpoint } from "@/lib/extract/endpoint-normalizer";
import { fromRequest } from "@/lib/extract/network-capture";
import { extractPromiseCandidates } from "@/lib/extract/promise-analysis";
import { CrawlPolicyEngine, getRegistrableDomain } from "@/lib/runner/crawl-policy";
import { CrawlFrontier, discoverNavigationTargets } from "@/lib/runner/crawl-controller";
import { shouldCaptureNetworkRequest } from "@/lib/runner/network-capture-policy";
import { effectiveCrawlMaxPages } from "@/lib/runner/crawl-limits";
import { saveEndpoint, updateRun } from "@/lib/runner/run-store";
import type { RunConfig } from "@/lib/types/endpoints";

const loginWaiters = new Map<string, () => void>();

interface ExtractionCallbacks {
  onDiscoveredDomain?: (input: { domain: string; sourceUrl: string }) => Promise<void>;
}

export async function startExtractionRun(runId: string, config: RunConfig, callbacks?: ExtractionCallbacks): Promise<void> {
  let browser: Browser | null = null;
  try {
    const launchOptions = getLaunchOptions();
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext(getContextOptions(config.targetUrl));
    await applyStealthPatches(context);
    const page = await context.newPage();

    if (config.loginUrl) {
      if (launchOptions.headless) {
        throw new Error(
          "Manual login is not available in headless/container mode. Run with HEADED_BROWSER=true and a desktop session."
        );
      }
      await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
      await updateRun(runId, "pending_login", "Login required. Complete login in browser and click Login Complete.");
      await waitForLoginConfirmation(runId);
    }

    await updateRun(runId, "running", "Crawl started.");
    const maxPages = effectiveCrawlMaxPages(config.maxPages ?? 25, config.unlimitedPages === true);
    const maxDepth = Math.max(1, config.maxDepth ?? 2);
    const retryCount = Math.max(0, config.retryCount ?? 1);
    const target = new URL(config.targetUrl);
    const origin = target.origin;
    registerNetworkCapture(runId, context, origin);
    const policy = new CrawlPolicyEngine({
      seedUrl: config.targetUrl,
      approvedDomains: config.allowedDomains ?? []
    });
    const frontier = new CrawlFrontier(config.targetUrl, {
      maxPages,
      maxDepth,
      isAllowed: (candidate) => {
        const decision = policy.decide(candidate);
        return decision.allowed;
      }
    });

    while (true) {
      const node = frontier.next();
      if (!node) {
        break;
      }
      const visitedCount = frontier.size();
      const pageLabel = config.unlimitedPages === true ? "∞" : String(maxPages);
      await updateRun(runId, "running", `Crawling ${visitedCount}/${pageLabel}: ${node.url}`);
      const success = await safeGoto(page, node.url, retryCount);
      if (!success) {
        continue;
      }
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(450);
      await evaluateScripts(runId, page, origin);
      const discovered = await discoverNavigationTargets(page, (candidate) => {
        const decision = policy.decide(candidate);
        if (!decision.allowed && decision.discoveredDomain && config.batchRunId && callbacks?.onDiscoveredDomain) {
          void callbacks.onDiscoveredDomain({
            domain: decision.discoveredDomain,
            sourceUrl: page.url()
          });
        }
        return decision.allowed;
      });
      for (const link of discovered.links) {
        frontier.enqueue({ url: link, depth: node.depth + 1 });
      }
    }

    await updateRun(runId, "completed", "Run completed successfully.");
  } catch (error) {
    const message = formatRunnerError(error);
    await updateRun(runId, "failed", message);
  } finally {
    loginWaiters.delete(runId);
    await browser?.close();
  }
}

async function safeGoto(page: import("playwright").Page, url: string, retryCount: number): Promise<boolean> {
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
      return true;
    } catch {
      if (attempt === retryCount) {
        return false;
      }
      await page.waitForTimeout(300 * (attempt + 1));
    }
  }
  return false;
}

function getLaunchOptions(): { headless: boolean; args: string[] } {
  const forceHeaded = process.env.HEADED_BROWSER === "true";
  const defaultHeadless = process.platform === "linux" && !forceHeaded;
  const commonArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-web-security"
  ];
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [];
  return {
    headless: defaultHeadless,
    args: [...commonArgs, ...linuxArgs]
  };
}

function getContextOptions(targetUrl: string): import("playwright").BrowserContextOptions {
  const target = new URL(targetUrl);
  const timezoneId = process.env.BROWSER_TIMEZONE || "Europe/Istanbul";
  const locale = process.env.BROWSER_LOCALE || "en-US";
  const geolocation = process.env.BROWSER_GEO_LAT && process.env.BROWSER_GEO_LON
    ? {
        latitude: Number(process.env.BROWSER_GEO_LAT),
        longitude: Number(process.env.BROWSER_GEO_LON)
      }
    : undefined;

  return {
    viewport: { width: 1366, height: 768 },
    screen: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    locale,
    timezoneId,
    colorScheme: "light",
    userAgent:
      process.env.BROWSER_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    geolocation,
    permissions: geolocation ? ["geolocation"] : [],
    extraHTTPHeaders: {
      "Accept-Language": `${locale},en;q=0.9`,
      Referer: target.origin
    }
  };
}

async function applyStealthPatches(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });

    Object.defineProperty(navigator, "plugins", {
      get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }]
    });

    // Make Chrome runtime checks less bot-like.
    const w = window as unknown as { chrome?: { runtime?: unknown } };
    if (!w.chrome) {
      w.chrome = { runtime: {} };
    }

    // Normalize permission checks used by anti-bot widgets.
    const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (originalQuery) {
      window.navigator.permissions.query = ((parameters: PermissionDescriptor) => {
        if (parameters.name === "notifications") {
          return Promise.resolve({ state: Notification.permission } as PermissionStatus);
        }
        return originalQuery(parameters);
      }) as typeof window.navigator.permissions.query;
    }
  });
}

function formatRunnerError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown extraction error";
  const withoutBrowserLogs = raw.split("Browser logs:")[0]?.trim() ?? raw;
  return withoutBrowserLogs.length > 500 ? `${withoutBrowserLogs.slice(0, 500)}...` : withoutBrowserLogs;
}

export function completeLogin(runId: string): boolean {
  const release = loginWaiters.get(runId);
  if (!release) {
    return false;
  }
  release();
  loginWaiters.delete(runId);
  return true;
}

function waitForLoginConfirmation(runId: string): Promise<void> {
  return new Promise((resolve) => {
    loginWaiters.set(runId, resolve);
  });
}

function safeRequestPageUrl(request: import("playwright").Request, fallback: string): string {
  try {
    return request.frame()?.url() ?? fallback;
  } catch {
    // Service worker and other non-frame requests throw from frame().
    return fallback;
  }
}

function registerNetworkCapture(runId: string, context: BrowserContext, originUrl: string): void {
  const domain = getRegistrableDomain(new URL(originUrl).hostname);
  context.on("request", async (request) => {
    try {
      if (!shouldCaptureNetworkRequest(request.resourceType())) {
        return;
      }
      const candidate = fromRequest(request, {
        originUrl,
        pageUrl: safeRequestPageUrl(request, originUrl),
        registrableDomain: domain
      });
      const endpoint = normalizeEndpoint(runId, candidate);
      await saveEndpoint(endpoint);
    } catch {
      // Skip malformed or unsupported requests; never reject the listener.
    }
  });
}

async function evaluateScripts(runId: string, page: import("playwright").Page, originUrl: string): Promise<void> {
  const scriptPayload = await page.evaluate(() => {
    return Array.from(document.scripts)
      .map((script) => ({
        src: script.src ?? "",
        inlineText: script.textContent ?? ""
      }))
      .filter((entry) => entry.src || entry.inlineText);
  });

  const scriptTexts = new Set<string>();
  for (const entry of scriptPayload) {
    if (entry.inlineText) {
      scriptTexts.add(entry.inlineText);
    }
    if (entry.src) {
      try {
        const response = await page.request.get(entry.src);
        if (response.ok()) {
          const externalJs = await response.text();
          if (externalJs) {
            scriptTexts.add(externalJs);
          }
        }
      } catch {
        // Intentionally skip inaccessible external script URLs.
      }
    }
  }

  for (const scriptText of scriptTexts) {
    const staticCandidates = extractStaticCandidates(scriptText);
    const promiseCandidates = extractPromiseCandidates(scriptText);
    for (const candidate of dedupeCandidates([...staticCandidates, ...promiseCandidates])) {
      const endpoint = normalizeEndpoint(runId, {
        ...candidate,
        originUrl,
        pageUrl: page.url(),
        registrableDomain: getRegistrableDomain(new URL(originUrl).hostname)
      });
      await saveEndpoint(endpoint);
    }
  }
}

function dedupeCandidates<T extends { resolvedUrl: string; method: string; sourceType: string }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.sourceType}|${candidate.method}|${candidate.resolvedUrl}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}
