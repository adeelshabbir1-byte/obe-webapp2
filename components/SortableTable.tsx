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
  /** Data-level sorting: when given, header clicks report (column, direction) here instead of
   * re-ordering DOM rows — for tables that page their data themselves. `null` = back to the original order. */
  onSort?: (column: number, direction: "asc" | "desc" | null) => void;
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
  const originalOrderRef = useRef<Element[]>([]);
  // phase: 0 = original order, 1 = ascending, 2 = descending. Clicking the same header cycles
  // 1 -> 2 -> 0 -> 1 ...; clicking a different header always starts that header fresh at ascending.
  const sortState = useRef({ col: -1, phase: 0 as 0 | 1 | 2 });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [counts, setCounts] = useState({ total: 0, matched: 0 });
  const [ready, setReady] = useState(false);

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

    // Remember the row order the table actually loaded with, so sorting
    // can be undone back to it — without this, once a column had been
    // clicked there was no way back to the natural week/lecture order
    // short of reloading the whole page. Only re-captured when the row
    // count changes (new/removed data), not on every render, so it
    // doesn't keep "forgetting" the original order while mid-sort.
    const currentRows = Array.from(tbody.querySelectorAll(":scope > tr"));
    if (originalOrderRef.current.length !== currentRows.length) {
      originalOrderRef.current = currentRows;
    }

    const markHeaders = (colIndex: number, phase: 0 | 1 | 2) => headers.forEach((h, i) => {
      h.removeAttribute("data-sort");
      h.removeAttribute("aria-sort");
      if (phase !== 0 && i === colIndex) {
        h.setAttribute("data-sort", phase === 1 ? "asc" : "desc");
        h.setAttribute("aria-sort", phase === 1 ? "ascending" : "descending");
      }
    });

    function sortByColumn(colIndex: number) {
      if (!tbody) return;
      const state = sortState.current;
      const phase: 0 | 1 | 2 = state.col === colIndex ? (state.phase === 1 ? 2 : state.phase === 2 ? 0 : 1) : 1;
      sortState.current = { col: colIndex, phase };
      markHeaders(colIndex, phase);

      if (onSortRef.current) { onSortRef.current(colIndex, phase === 0 ? null : phase === 1 ? "asc" : "desc"); return; }

      if (phase === 0) {
        originalOrderRef.current.forEach((row) => tbody.appendChild(row));
        apply();
        return;
      }

      const asc = phase === 1;
      const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
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
        const cmp = bothLookNumeric && !isNaN(aNum) && !isNaN(bNum) ? aNum - bNum : aText.localeCompare(bText);
        return asc ? cmp : -cmp;
      });
      sorted.forEach((row) => tbody.appendChild(row));
      apply();
    }

    const cleanups: (() => void)[] = [];
    headers.forEach((h, i) => {
      if (!h.textContent?.trim()) return;
      h.classList.add("sortable-th");
      const hadTitle = h.hasAttribute("title");
      if (!hadTitle) h.title = "Click to sort — click again to reverse, a third time for the original order";
      const handler = () => sortByColumn(i);
      h.addEventListener("click", handler);
      cleanups.push(() => { h.removeEventListener("click", handler); h.classList.remove("sortable-th"); h.removeAttribute("data-sort"); if (!hadTitle) h.removeAttribute("title"); });
    });
    // The indicator is removed by the cleanup above on every render; put it back for the active sort.
    if (sortState.current.phase !== 0) markHeaders(sortState.current.col, sortState.current.phase);

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
  useEffect(() => { setReady(true); }, []);

  const showSearch = (searchable ?? true) && counts.total > SEARCH_MIN_ROWS;
  const showPager = paginate && (counts.matched > size || size !== pageSize);
  const filtered = query.trim() !== "";

  return (
    // Until hydration applies paging, CSS caps the server-rendered table at one page so it doesn't flash at full length.
    <div className={`dt${paginate && !ready && pageSize === 25 ? " dt-pre" : ""}`}>
      {showSearch && (
        <div className="dt-toolbar no-print">
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
        <p className="small-note no-print" style={{ textAlign: "center", padding: "14px 0 2px" }}>No rows match “{query}”.</p>
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
