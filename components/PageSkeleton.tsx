// Shown at once while a heavy page loads on the server: the app frame with grey placeholder blocks.
export default function PageSkeleton() {
  const bar = (w: string, h = 14) => <div style={{ width: w, height: h, borderRadius: 6, background: "linear-gradient(90deg,#ECE7E6 25%,#F5F1F0 50%,#ECE7E6 75%)", backgroundSize: "200% 100%", animation: "skel 1.2s infinite linear", marginBottom: 10 }} />;
  return (
    <div className="shell">
      <style>{"@keyframes skel{from{background-position:200% 0}to{background-position:-200% 0}}"}</style>
      <aside className="sidebar" aria-hidden="true" />
      <div className="main" style={{ padding: 24, flex: 1 }}>
        {bar("260px", 24)}
        {bar("420px")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, margin: "16px 0" }}>{[0, 1, 2, 3].map((i) => <div key={i}>{bar("100%", 64)}</div>)}</div>
        {bar("100%", 220)}
        <div style={{ fontSize: 12, color: "var(--slate)" }}>Loading…</div>
      </div>
    </div>
  );
}
