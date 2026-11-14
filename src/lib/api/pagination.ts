export interface PageRequest {
  page: number;
  pageSize: number;
}

export function parsePageRequest(input: {
  pageParam: string | null;
  pageSizeParam: string | null;
  defaultPage?: number;
  defaultPageSize?: number;
  minPageSize?: number;
  maxPageSize?: number;
}): PageRequest {
  const defaultPage = input.defaultPage ?? 1;
  const defaultPageSize = input.defaultPageSize ?? 100;
  const minPageSize = input.minPageSize ?? 20;
  const maxPageSize = input.maxPageSize ?? 300;

  const parsedPage = Number(input.pageParam ?? String(defaultPage));
  const parsedPageSize = Number(input.pageSizeParam ?? String(defaultPageSize));
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : defaultPage;
  const pageSize = Number.isFinite(parsedPageSize)
    ? Math.min(maxPageSize, Math.max(minPageSize, Math.floor(parsedPageSize)))
    : defaultPageSize;
  return { page, pageSize };
}
