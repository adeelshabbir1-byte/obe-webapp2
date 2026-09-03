export default function SimpleBarChart({ bars, maxValue, unit }: { bars: { label: string; value: number; color?: string }[]; maxValue?: number; unit?: string }) {
  const max = maxValue || Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 140, fontSize: 11.5, textAlign: "right", flexShrink: 0 }}>{b.label}</div>
          <div style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--line)", height: 20, position: "relative" }}>
            <div style={{
              width: `${Math.min(100, (b.value / max) * 100)}%`, height: "100%",
              background: b.color || "var(--brass)", transition: "width .2s",
            }} />
          </div>
          <div style={{ width: 50, fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>{b.value}{unit || ""}</div>
        </div>
      ))}
    </div>
  );
}
