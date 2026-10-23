/** The collapsible "What this shows and how it is calculated" note at the top of a report or score page. */
export default function HowCalculated({ shows, children, open = false }: { shows: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="card no-print" open={open} style={{ borderLeft: "4px solid #1F4E8C", padding: "10px 14px", marginBottom: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, color: "#1F4E8C" }}>What this shows and how it is calculated</summary>
      <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
        <p style={{ margin: "0 0 6px" }}>{shows}</p>
        {children}
        <p className="small-note" style={{ margin: "6px 0 0" }}>Words you don&apos;t know? See the <a href="/help/glossary">Glossary</a>.</p>
      </div>
    </details>
  );
}
