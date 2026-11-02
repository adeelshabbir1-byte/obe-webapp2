import { linkOf, national, adoption } from "../../../lib/hecView";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "OBEHUB — national view", robots: { index: false } };

// HEC's read-only national view: totals of the universities that chose to share (never a student's or teacher's name),
// and national curriculum adoption. Reached only through a private link from the OBEHUB platform team.
export default async function HecPage({ params }: { params: { token: string } }) {
  const l = await linkOf(params.token).catch(() => null);
  if (!l) return <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}><h1 style={{ fontSize: 20 }}>Link not valid</h1><p>This link has expired or was revoked. Ask the OBEHUB team for a new one.</p></main>;
  const [n, a] = await Promise.all([national(), adoption()]);
  const real = n.institutes.filter((i) => !i.demo);
  const sum = (f: (i: (typeof real)[number]) => number) => real.reduce((t, i) => t + f(i), 0);
  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px", lineHeight: 1.5 }}>
      <p className="small-note" style={{ margin: 0 }}>OBEHUB national view · {l.label} · valid until {new Date(l.expiresAt).toISOString().slice(0, 10)}</p>
      <h1 style={{ fontSize: 24, margin: "4px 0" }}>Universities on OBEHUB</h1>
      <p className="small-note">{n.sharing} of {n.totalInstitutes} institutes share their totals with HEC. Totals only; no student or teacher is named. Demo institutes are marked and left out of the sums.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
        {[["Sharing institutes", real.length], ["Students", sum((i) => i.students)], ["Courses this term", sum((i) => i.offered)], ["CQI actions", sum((i) => i.cqi)], ["CQI actions shown effective", sum((i) => i.cqiEffective)]].map(([k, v]) => <div key={String(k)} className="card" style={{ flex: "1 1 160px", margin: 0 }}><div className="small-note">{k}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{Number(v).toLocaleString()}</div></div>)}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Institutes</h2>
        <table style={{ fontSize: 13 }}><thead><tr><th>Institute</th><th>Programs</th><th>Students</th><th>Courses this term</th><th>CLOs mapped to GAs</th><th>CQI (effective)</th></tr></thead>
          <tbody>{n.institutes.map((i) => <tr key={i.id}><td>{i.name}{i.demo ? " (demo)" : ""}</td><td>{i.programs.join(", ") || "—"}</td><td>{i.students}</td><td>{i.offered}</td><td>{i.cloMappedPct === null ? "—" : `${i.cloMappedPct}%`}</td><td>{i.cqi} ({i.cqiEffective})</td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Graduate-attribute attainment by program</h2>
        <p className="small-note">Average attainment of each GA over the courses on students&apos; transcripts.</p>
        {n.institutes.flatMap((i) => i.gaByProgram.map((p) => ({ inst: i.name, ...p }))).filter((p) => p.gas.length).map((p) => (
          <div key={p.inst + p.program} style={{ marginBottom: 8, fontSize: 13 }}><b>{p.inst}</b> — {p.program}: {p.gas.map((g) => <span key={g.number} style={{ display: "inline-block", margin: "2px 6px 2px 0", padding: "1px 8px", borderRadius: 999, background: g.pct >= 60 ? "#E3F2E8" : g.pct >= 50 ? "#FBF3E4" : "#FBE4E2" }}>GA-{g.number} {g.pct}%</span>)}</div>))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>National curriculum adoption</h2>
        <table style={{ fontSize: 13 }}><thead><tr><th>Curriculum</th><th>Latest version</th><th>Adopted (by version)</th><th>On an older version</th></tr></thead>
          <tbody>{a.map((c) => <tr key={c.authority + c.title}><td>{c.authority} — {c.title}</td><td>{c.latest}</td><td>{c.versions.map((v) => `${v.version}: ${v.count}${v.named.length ? ` (${v.named.join(", ")})` : ""}`).join(" · ")}</td><td style={{ color: c.behind ? "#8a5a00" : undefined }}>{c.behind}</td></tr>)}</tbody></table>
        <p className="small-note">Counts include every institute; names are shown only for institutes that share with HEC.</p>
      </div>
    </main>
  );
}
