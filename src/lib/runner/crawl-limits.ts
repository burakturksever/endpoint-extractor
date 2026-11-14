/** Upper bound when "unlimited" pages is enabled (true infinity would risk hangs / DB overload). */
export const CRAWL_PRACTICAL_INFINITE_MAX_PAGES = 500_000;

export function effectiveCrawlMaxPages(nominalMaxPages: number, unlimitedPages: boolean): number {
  if (unlimitedPages) {
    return CRAWL_PRACTICAL_INFINITE_MAX_PAGES;
  }
  return Math.max(1, nominalMaxPages);
}
