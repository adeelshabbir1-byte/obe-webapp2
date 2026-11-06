"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Long tables on any page are split into pages of PAGE rows, with a pager titled after the table's heading
// ("Students — page 2 of 6 · 287 rows", Previous / Next, page numbers, Show all). Works on every page without changing
// it: a table opts out with data-no-paginate. Printing shows every row. Rows a page filters itself (display none) are
// left alone; the pager follows when the rows change.
const PAGE = 50;
const ATTR = "data-pg-hide";

function titleOf(table: HTMLTableElement): string {
  const cap = table.querySelector("caption")?.textContent?.trim();
  if (cap) return cap;
  // The nearest heading (or bold title) before the table inside its card.
  let el: Element | null = table;
  for (let hops = 0; el && hops < 6; hops++) {
    let sib: Element | null = el.previousElementSibling;
    while (sib) {
      const h = sib.matches("h1,h2,h3,h4,b,strong") ? sib : sib.querySelector("h1,h2,h3,h4");
      const t = h?.textContent?.trim();
      if (t) return t.length > 80 ? `${t.slice(0, 77)}…` : t;
      sib = sib.previousElementSibling;
    }
    el = el.parentElement;
    if (el?.classList.contains("main") || el?.tagName === "MAIN") break;
  }
  return "Rows";
}

function setup(table: HTMLTableElement) {
  if (table.dataset.noPaginate !== undefined || table.closest("[data-no-paginate]")) return;
  const body = table.tBodies[0];
  if (!body) return;
  const rows = Array.from(body.rows).filter((r) => !(r.style.display === "none" && !r.hasAttribute(ATTR)));
  const bar = (table.nextElementSibling as HTMLElement | null)?.dataset?.pgBar !== undefined ? (table.nextElementSibling as HTMLElement) : null;
  if (rows.length <= PAGE) {
    rows.forEach((r) => r.removeAttribute(ATTR));
    bar?.remove();
    return;
  }
  const pages = Math.ceil(rows.length / PAGE);
  let page = Math.min(Number(table.dataset.pgPage || 1), pages);
  const showAll = table.dataset.pgAll === "1";
  const apply = () => {
    rows.forEach((r, i) => { const on = showAll || (i >= (page - 1) * PAGE && i < page * PAGE); if (on) r.removeAttribute(ATTR); else r.setAttribute(ATTR, "1"); });
  };
  apply();
  const el = bar || document.createElement("div");
  el.dataset.pgBar = "";
  el.className = "pg-bar no-print";
  const title = titleOf(table);
  const btn = (label: string, to: number | "all" | "pages", current = false, disabled = false) => `<button type="button" class="btn btn-sm ${current ? "" : "btn-secondary"}" data-to="${to}" ${disabled ? "disabled" : ""} ${current ? 'aria-current="page"' : ""}>${label}</button>`;
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…");
  el.innerHTML = showAll
    ? `<span class="pg-title"><b></b> · all ${rows.length} rows</span>${btn("Show pages", "pages")}`
    : `<span class="pg-title"><b></b> — page ${page} of ${pages} · ${rows.length} rows</span>${btn("‹ Previous", page - 1, false, page <= 1)}${nums.map((n) => (n === "…" ? "<span>…</span>" : btn(String(n), n, n === page))).join("")}${btn("Next ›", page + 1, false, page >= pages)}${btn("Show all", "all")}`;
  (el.querySelector(".pg-title b") as HTMLElement).textContent = title;
  el.onclick = (e) => {
    const t = (e.target as HTMLElement).closest("button[data-to]") as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const to = t.dataset.to!;
    if (to === "all") table.dataset.pgAll = "1";
    else if (to === "pages") delete table.dataset.pgAll;
    else { delete table.dataset.pgAll; table.dataset.pgPage = to; page = Number(to); }
    setup(table);
    if (to !== "all") (table.closest(".card") || table).scrollIntoView({ block: "nearest" });
  };
  if (!bar) table.insertAdjacentElement("afterend", el);
}

export default function AutoPaginate() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.querySelector(".main, main.st-main, main") as HTMLElement | null;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => { root.querySelectorAll("table").forEach((t) => setup(t as HTMLTableElement)); };
    run();
    // Rows added or removed by the page (filters, live updates): set the pages again, at most every 150 ms.
    const obs = new MutationObserver((muts) => {
      if (muts.every((m) => (m.target as HTMLElement).closest?.("[data-pg-bar]"))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 150);
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, [pathname]);
  return null;
}
