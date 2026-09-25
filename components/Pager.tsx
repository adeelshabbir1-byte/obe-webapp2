"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Page numbers to show: always first/last, a window around the current page, gaps as "…". */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pageCount - 1) out.push("gap");
  out.push(pageCount);
  return out;
}

/**
 * Pagination bar. Works two ways:
 *  - client-side: pass onPage / onPageSize callbacks;
 *  - server-side: pass hrefTemplate (e.g. "/chairman/audit-log?page={page}") and it
 *    renders plain links, so the URL is the state and the server does the paging.
 */
export default function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes,
  hrefTemplate,
  noun = "rows",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage?: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: number[];
  hrefTemplate?: string;
  noun?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  function pageButton(target: number, label: string, children: React.ReactNode, isCurrent = false) {
    const disabled = target < 1 || target > pageCount;
    if (hrefTemplate && !disabled && !isCurrent) {
      return <Link key={label} href={hrefTemplate.replace("{page}", String(target))} className="pager-btn" aria-label={label}>{children}</Link>;
    }
    return (
      <button
        key={label}
        type="button"
        className="pager-btn"
        aria-label={label}
        aria-current={isCurrent ? "page" : undefined}
        disabled={disabled}
        onClick={() => { if (!disabled && !isCurrent) onPage?.(target); }}
      >
        {children}
      </button>
    );
  }

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-info">
        Showing <b>{from.toLocaleString()}–{to.toLocaleString()}</b> of <b>{total.toLocaleString()}</b> {noun}
      </span>
      <div className="pager-controls">
        {onPageSize && pageSizes && (
          <label className="pager-size" style={{ marginRight: 8 }}>
            Rows
            <select value={pageSize} onChange={(e) => onPageSize(parseInt(e.target.value, 10))}>
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {pageButton(current - 1, "Previous page", <ChevronLeft size={15} />)}
        {pageWindow(current, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="pager-gap">…</span>
          ) : (
            pageButton(p, `Page ${p}`, p, p === current)
          ),
        )}
        {pageButton(current + 1, "Next page", <ChevronRight size={15} />)}
      </div>
    </nav>
  );
}
