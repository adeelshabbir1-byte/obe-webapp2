"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import Pager from "./Pager";

type Props = React.TableHTMLAttributes<HTMLTableElement> & {
  /** Rows per page. Pagination only appears once a table has more rows than this. */
  pageSize?: number;
  /** Turn pagination off for data-entry grids and matrices where every row must stay on screen. */
  paginate?: boolean;
  /** Show the quick-filter box (defaults to on for tables with more than 8 rows). */
  searchable?: boolean;
  /** Data-level sorting: when given, header clicks report (column, ascending) here instead of
   * re-ordering DOM rows — for tables that page their data themselves. */
  onSort?: (column: number, ascending: boolean) => void;
};

const PAGE_SIZES = [10, 25, 50, 100];
const SEARCH_MIN_ROWS = 8;

/**
 * Drop-in replacement for the native <table> element that adds click-to-sort
 * on any column, a quick filter, and pagination — without needing each
 * table's data restructured. It works on the already-rendered <thead>/<tbody>
 * DOM: sorting re-orders <tr> elements, filtering/paging hides rows with an
 * attribute. Hidden rows stay mounted, so any inputs or state inside them are
 * untouched; printing always shows every row.
 * Columns with an empty header (action columns) are not made sortable.
 */
export default function SortableTable({ pageSize = 25, paginate = true, searchable, onSort, className, style, ...props }: Props) {
  const ref = useRef<HTMLTableElement>(null);
  const sortState = useRef({ col: -1, asc: true });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [counts, setCounts] = useState({ total: 0, matched: 0 });

  const view = useRef({ query, page, size, paginate });
  view.current = { query, page, size, paginate };
  const onSortRef = useRef(onSort);
  onSortRef.current = onSort;

  /** Applies the current filter + page to the rows and records the counts for the toolbar/pager. */
  const apply = useCallback(() => {
    const tbody = ref.current?.tBodies[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows);
    const { query: q, page: p, size: s, paginate: pg } = view.current;
    const needle = q.trim().toLowerCase();

    const matched: HTMLTableRowElement[] = [];
    for (const row of rows) {
      const hit = !needle || (row.textContent || "").toLowerCase().includes(needle);
      if (hit) matched.push(row);
      else row.setAttribute("data-dt-hidden", "");
    }
    const pageCount = Math.max(1, Math.ceil(matched.length / s));
    const current = Math.min(p, pageCount);
    const start = (current - 1) * s;
    const usePaging = pg && matched.length > s;
    matched.forEach((row, i) => {
      if (usePaging && (i < start || i >= start + s)) row.setAttribute("data-dt-hidden", "");
      else row.removeAttribute("data-dt-hidden");
    });

    setCounts((prev) => (prev.total === rows.length && prev.matched === matched.length ? prev : { total: rows.length, matched: matched.length }));
    if (current !== p) setPage(current);
  }, []);

  // Header click-to-sort. Re-attached after every render (as before) so newly
  // rendered header cells are always wired up.
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    if (!thead || !tbody) return;
    const headers = Array.from(thead.querySelectorAll("th"));

    function sortByColumn(colIndex: number) {
      if (!tbody) return;
      const asc = sortState.current.col === colIndex ? !sortState.current.asc : true;
      sortState.current = { col: colIndex, asc };

      const markHeaders = () => headers.forEach((h, i) => {
        h.removeAttribute("data-sort");
        h.removeAttribute("aria-sort");
        if (i === colIndex) {
          h.setAttribute("data-sort", asc ? "asc" : "desc");
          h.setAttribute("aria-sort", asc ? "ascending" : "descending");
        }
      });
      if (onSortRef.current) { markHeaders(); onSortRef.current(colIndex, asc); return; }

      const rows = Array.from(tbody.rows);
      // innerText only reflects rendered text, so every row must be visible
      // while the sort keys are read; apply() re-hides after re-ordering.
      rows.forEach((row) => row.removeAttribute("data-dt-hidden"));
      const sorted = rows.slice().sort((a, b) => {
        const aCell = a.children[colIndex] as HTMLElement | undefined;
        const bCell = b.children[colIndex] as HTMLElement | undefined;
        const aText = (aCell?.innerText || "").trim();
        const bText = (bCell?.innerText || "").trim();
        const aNum = parseFloat(aText.replace(/[^0-9.\-]/g, ""));
        const bNum = parseFloat(bText.replace(/[^0-9.\-]/g, ""));
        const bothLookNumeric = /^-?[\d.,%]+$/.test(aText) && /^-?[\d.,%]+$/.test(bText);
        const cmp = bothLookNumeric && !isNaN(aNum) && !isNaN(bNum) ? aNum - bNum : aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
        return asc ? cmp : -cmp;
      });
      sorted.forEach((row) => tbody.appendChild(row));
      markHeaders();
      apply();
    }

    const cleanups: (() => void)[] = [];
    headers.forEach((h, i) => {
      if (!h.textContent?.trim() || h.colSpan > 1) return;
      h.classList.add("sortable-th");
      const handler = () => sortByColumn(i);
      h.addEventListener("click", handler);
      cleanups.push(() => { h.removeEventListener("click", handler); h.classList.remove("sortable-th"); });
    });
    // Restore the indicator on re-render.
    if (sortState.current.col >= 0 && headers[sortState.current.col]) {
      headers[sortState.current.col].setAttribute("data-sort", sortState.current.asc ? "asc" : "desc");
    }

    return () => cleanups.forEach((fn) => fn());
  });

  // Re-page whenever rows are added/removed by React, or the view changes.
  useEffect(() => {
    const tbody = ref.current?.tBodies[0];
    if (!tbody) return;
    const observer = new MutationObserver(() => apply());
    observer.observe(tbody, { childList: true });
    return () => observer.disconnect();
  }, [apply]);

  useEffect(() => { apply(); }, [apply, query, page, size, paginate]);

  const showSearch = (searchable ?? true) && counts.total > SEARCH_MIN_ROWS;
  const showPager = paginate && (counts.matched > size || size !== pageSize);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const filtered = query.trim() !== "";

  return (
    // Until hydration applies paging, CSS caps the server-rendered table at one page so it doesn't flash at full length.
    <div className={`dt${paginate && !ready && pageSize === 25 ? " dt-pre" : ""}`}>
      {showSearch && (
        <div className="dt-toolbar">
          <label className="dt-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search this table…"
              aria-label="Search this table"
            />
          </label>
          <span className="dt-count">
            {filtered ? <><b>{counts.matched}</b> of {counts.total} rows match</> : <><b>{counts.total}</b> rows</>}
          </span>
        </div>
      )}
      <div className="dt-scroll">
        <table ref={ref} className={className} style={style} {...props} />
      </div>
      {filtered && counts.matched === 0 && (
        <p className="small-note" style={{ textAlign: "center", padding: "14px 0 2px" }}>No rows match “{query}”.</p>
      )}
      {showPager && (
        <Pager
          page={page}
          pageSize={size}
          total={counts.matched}
          onPage={setPage}
          onPageSize={(n) => { setSize(n); setPage(1); }}
          pageSizes={PAGE_SIZES.includes(pageSize) ? PAGE_SIZES : [...PAGE_SIZES, pageSize].sort((a, b) => a - b)}
        />
      )}
    </div>
  );
}
