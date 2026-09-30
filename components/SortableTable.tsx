"use client";

import { useEffect, useRef } from "react";

/**
 * Drop-in replacement for the native <table> element that adds click-to-sort
 * on any column, without needing each table's data restructured — it reads
 * the already-rendered <thead>/<tbody> DOM and re-sorts <tr> elements.
 * Columns with an empty header (action columns) are not made sortable.
 */
export default function SortableTable(props: React.TableHTMLAttributes<HTMLTableElement>) {
  const ref = useRef<HTMLTableElement>(null);
  const originalOrderRef = useRef<Element[]>([]);

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
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

    // phase: 0 = original order, 1 = ascending, 2 = descending. Clicking
    // the same header cycles 1 -> 2 -> 0 -> 1 ...; clicking a different
    // header always starts that header fresh at ascending.
    const state = { col: -1, phase: 0 as 0 | 1 | 2 };

    function sortByColumn(colIndex: number) {
      if (!tbody) return;
      const phase: 0 | 1 | 2 = state.col === colIndex ? (state.phase === 1 ? 2 : state.phase === 2 ? 0 : 1) : 1;
      state.col = colIndex; state.phase = phase;

      if (phase === 0) {
        originalOrderRef.current.forEach((row) => tbody!.appendChild(row));
        headers.forEach((h) => h.removeAttribute("data-sort"));
        return;
      }

      const asc = phase === 1;
      const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
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

      headers.forEach((h, i) => {
        h.removeAttribute("data-sort");
        if (i === colIndex) h.setAttribute("data-sort", asc ? "asc" : "desc");
      });
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

    return () => cleanups.forEach((fn) => fn());
  });

  return <table ref={ref} {...props} />;
}
