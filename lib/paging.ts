// Paging for API lists: ?page=1&pageSize=50 → { skip, take } (pageSize capped), and the page info sent back with the
// rows so the screen can show "page 2 of 7". One extra row is fetched to know whether there is a next page without a
// separate count query.
export type Page = { page: number; pageSize: number; skip: number; take: number };

export function pageOf(sp: URLSearchParams, opts: { size?: number; max?: number } = {}): Page {
  const size = opts.size ?? 50, max = opts.max ?? 200;
  const pageSize = Math.max(1, Math.min(max, Number(sp.get("pageSize")) || size));
  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize + 1 };
}
/** The rows of this page and whether more follow (rows were fetched with take = pageSize + 1). */
export function pageResult<T>(rows: T[], p: Page) {
  return { rows: rows.slice(0, p.pageSize), page: p.page, pageSize: p.pageSize, hasMore: rows.length > p.pageSize };
}
