"use client";
import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";

// Shows only one section at a time. Mark each section with data-tab="Label" (any element); things without it are always shown.
// The tab bar appears where the first tabbed section would have been. The chosen tab is kept in the page address (#name).
export default function TabbedCards({ children, defaultTab, order }: { children: ReactNode; defaultTab?: string; order?: string[] }) {
  const items = Children.toArray(children);
  const labelOf = (c: ReactNode) => (isValidElement(c) ? ((c as ReactElement<Record<string, unknown>>).props["data-tab"] as string | undefined) : undefined);
  const found = Array.from(new Set(items.map(labelOf).filter((l): l is string => !!l)));
  const labels = order ? [...order.filter((o) => found.includes(o)), ...found.filter((x) => !order.includes(x))] : found;
  const [tab, setTab] = useState<string>(() => {
    try { const h = decodeURIComponent(window.location.hash.slice(1)); if (labels.includes(h)) return h; } catch { /* no window */ }
    return defaultTab && labels.includes(defaultTab) ? defaultTab : labels[0] || "";
  });
  const firstIdx = items.findIndex((c) => !!labelOf(c));
  return (
    <>
      {items.map((c, i) => {
        const l = labelOf(c);
        return (
          <div key={i}>
            {i === firstIdx && (
              <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "2px solid var(--line)", marginBottom: 16, position: "sticky", top: 0, background: "var(--paper, #fff)", zIndex: 5 }}>
                {labels.map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); try { window.location.hash = encodeURIComponent(k); } catch { /* ignore */ } }}
                    style={{ padding: "10px 16px", border: "none", background: tab === k ? "#fff" : "transparent", borderBottom: tab === k ? "3px solid var(--maroon, #7a1f2b)" : "3px solid transparent", fontWeight: tab === k ? 700 : 500, cursor: "pointer", fontSize: 14 }}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            <div style={l && l !== tab ? { display: "none" } : undefined}>{c}</div>
          </div>
        );
      })}
    </>
  );
}
