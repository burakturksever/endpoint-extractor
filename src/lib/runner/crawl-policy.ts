export interface CrawlPolicyDecision {
  allowed: boolean;
  discoveredDomain?: string;
}

export interface CrawlPolicyConfig {
  seedUrl: string;
  approvedDomains?: string[];
}

export class CrawlPolicyEngine {
  private readonly seedOrigin: string;
  private readonly seedDomain: string;
  private readonly approvedDomains: Set<string>;

  constructor(config: CrawlPolicyConfig) {
    this.seedOrigin = new URL(config.seedUrl).origin;
    this.seedDomain = getRegistrableDomain(new URL(config.seedUrl).hostname);
    this.approvedDomains = new Set((config.approvedDomains ?? []).map(normalizeDomain));
  }

  decide(candidateUrl: string): CrawlPolicyDecision {
    let parsed: URL;
    try {
      parsed = new URL(candidateUrl);
    } catch {
      return { allowed: false };
    }

    if (parsed.origin === this.seedOrigin) {
      return { allowed: true };
    }

    const candidateDomain = getRegistrableDomain(parsed.hostname);
    if (!candidateDomain) {
      return { allowed: false };
    }
    if (candidateDomain === this.seedDomain) {
      return { allowed: true, discoveredDomain: parsed.hostname.toLowerCase() };
    }
    if (this.approvedDomains.has(candidateDomain) || this.approvedDomains.has(parsed.hostname.toLowerCase())) {
      return { allowed: true, discoveredDomain: parsed.hostname.toLowerCase() };
    }
    return {
      allowed: false,
      discoveredDomain: parsed.hostname.toLowerCase()
    };
  }
}

export function getRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  return parts.slice(-2).join(".");
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}
