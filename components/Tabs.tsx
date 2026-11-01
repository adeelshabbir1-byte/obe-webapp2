import Link from "next/link";

// One shared tab bar (Adeel prompt §20). Server-rendered links: the open tab is in the URL (?tab=), so links and refresh
// keep it, and each tab's data is loaded only when that tab is opened. Badges show what needs attention.
// On phones it scrolls sideways.
export type TabDef = { key: string; label: string; badge?: number | string | null; warn?: boolean };
export default function Tabs({ tabs, current, base }: { tabs: TabDef[]; current: string; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <nav aria-label="Sections" className="no-print" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid var(--line, #ddd)", margin: "12px 0", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch" }}>
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link key={t.key} href={`${base}${sep}tab=${t.key}`} prefetch={false} scroll={false} aria-current={on ? "page" : undefined}
            style={{ padding: "7px 12px", fontSize: 13.5, fontWeight: on ? 700 : 500, borderBottom: on ? "3px solid var(--brass, #7E2435)" : "3px solid transparent", color: on ? "var(--ink, #222)" : "var(--slate, #555)", textDecoration: "none" }}>
            {t.label}
            {t.badge ? <span style={{ marginLeft: 6, background: t.warn ? "#B3261E" : "#E8E3E4", color: t.warn ? "#fff" : "#333", borderRadius: 9, fontSize: 11, padding: "0 6px" }}>{t.warn ? "⚠ " : ""}{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
