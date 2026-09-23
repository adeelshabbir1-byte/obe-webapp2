export type Stat = { label: string; value: number; href?: string; tone?: "warn" | "ok" | "neutral" };

const TONE_STYLE: Record<string, { bg: string; fg: string }> = {
  warn: { bg: "#FBEED2", fg: "#96650F" },
  ok: { bg: "#E2F4E8", fg: "var(--sage)" },
  neutral: { bg: "#F4EFEE", fg: "var(--ink)" },
};

export default function OverviewStatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
      {stats.map((s) => {
        const style = TONE_STYLE[s.tone || "neutral"];
        const content = (
          <div className="card" style={{ margin: 0, background: style.bg, cursor: s.href ? "pointer" : undefined }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: style.fg, fontFamily: "var(--font-display)" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2 }}>{s.label}</div>
          </div>
        );
        return s.href ? <a key={s.label} href={s.href} style={{ textDecoration: "none", color: "inherit" }}>{content}</a> : <div key={s.label}>{content}</div>;
      })}
    </div>
  );
}
