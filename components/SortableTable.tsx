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

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    if (!thead || !tbody) return;
    const headers = Array.from(thead.querySelectorAll("th"));

    const state = { col: -1, asc: true };

    function sortByColumn(colIndex: number) {
      if (!tbody) return;
      const asc = state.col === colIndex ? !state.asc : true;
      state.col = colIndex; state.asc = asc;

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
      const handler = () => sortByColumn(i);
      h.addEventListener("click", handler);
      cleanups.push(() => { h.removeEventListener("click", handler); h.classList.remove("sortable-th"); h.removeAttribute("data-sort"); });
    });

    return () => cleanups.forEach((fn) => fn());
  });

  return <table ref={ref} {...props} />;
}
