import { accentAt, accentText } from "../lib/accents";

/** Horizontal bar chart. Bars without an explicit colour each get their own accent, so no two bars look alike. */
export default function SimpleBarChart({ bars, maxValue, unit }: { bars: { label: string; value: number; color?: string }[]; maxValue?: number; unit?: string }) {
  const max = maxValue || Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {bars.map((b, i) => {
        const color = b.color || accentAt(i).c;
        return (
          <div key={b.label} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 32%) minmax(0, 1fr) auto", alignItems: "center", gap: 12 }}>
            <div title={b.label} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</div>
            <div style={{ background: "var(--surface-3)", borderRadius: 999, height: 12, overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(0, Math.min(100, (b.value / max) * 100))}%`, height: "100%", borderRadius: 999,
                background: color, transition: "width .5s var(--ease)",
              }} />
            </div>
            <div style={{ minWidth: 44, fontSize: 12.5, fontWeight: 800, color: accentText(color), fontFamily: "var(--font-display)", textAlign: "right" }}>{b.value}{unit || ""}</div>
          </div>
        );
      })}
    </div>
  );
}
