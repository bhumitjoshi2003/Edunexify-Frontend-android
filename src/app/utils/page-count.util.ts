/**
 * Counts shown on dashboards. Shared by the web and Android clients — keep the two copies identical.
 *
 * A count is only shown as a complete total when it really is one: the server's own total
 * (e.g. a status-filtered page's `totalElements`), or every row was on the page. A count taken
 * from one page of a longer list is labelled "N+" (at least N) instead of a misleading exact total.
 */
export interface PageLike<T> {
  content: T[];
  totalElements: number;
  last?: boolean;
}

export interface DashboardCount {
  count: number;
  /** True when `count` is the full total, not just what one page contained. */
  complete: boolean;
}

/** The server's total for a page that was already filtered server-side. */
export function serverTotal(page: PageLike<unknown>): DashboardCount {
  return { count: Math.max(0, page.totalElements ?? 0), complete: true };
}

/** Rows on this page matching `predicate`; complete only if the page held every row. */
export function countOnPage<T>(page: PageLike<T>, predicate: (row: T) => boolean): DashboardCount {
  const count = page.content.filter(predicate).length;
  const complete = page.last === true || (page.totalElements ?? 0) <= page.content.length;
  return { count, complete };
}

/** "3", or "3+" when more rows exist than were checked. */
export function countLabel(value: DashboardCount): string {
  return value.complete ? String(value.count) : `${value.count}+`;
}
