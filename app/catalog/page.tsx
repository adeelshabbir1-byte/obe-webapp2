import Link from "next/link";
import { prisma } from "../../lib/db";
import { cdb, CONSORTIUM_HINT } from "../../lib/consortium";
import { catalog, MODES, modeLabel, isOdl, terms } from "../../lib/consortiumOfferings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium course catalog", description: "Courses member universities open to each other's students — on campus and online (ODL)." };

const MODE_COL: Record<string, string> = { ON_CAMPUS: "#0D2A4A", LIVE_ONLINE: "#1565C0", BLENDED: "#6A1B9A", SELF_PACED: "#00796B" };

// Public: anyone can browse; students of member universities apply after signing in to their own student portal.
export default async function Catalog({ searchParams }: { searchParams: { q?: string; uni?: string; mode?: string; term?: string } }) {
  const rows = await catalog(searchParams).catch(() => null);
  const members = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true } }).catch(() => [])) as { chairmanId: string }[]);
  const heads = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.chairmanId) } }, select: { id: true, instituteName: true, name: true }, orderBy: { instituteName: "asc" } });
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1565C0", letterSpacing: 0.4 }}>OBEHUB CONSORTIUM</div>
        <h1 style={{ fontSize: 26, margin: "2px 0 4px" }}>Course catalog</h1>
        <p style={{ color: "var(--slate, #556)", fontSize: 14, margin: 0 }}>Courses {heads.length} member universit{heads.length === 1 ? "y opens" : "ies open"} to each other&apos;s students — on campus or online. A course counts toward your degree when your own university recognises it; final exams are proctored on a campus or exam centre. <Link href="/student/login">Student sign-in</Link></p>
      </header>
      <form method="get" className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "0 0 14px" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Search<input name="q" defaultValue={searchParams.q || ""} placeholder="course, code or university" style={{ width: 240 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>University<select name="uni" defaultValue={searchParams.uni || ""}><option value="">All</option>{heads.map((h) => <option key={h.id} value={h.id}>{h.instituteName || h.name}</option>)}</select></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Taught<select name="mode" defaultValue={searchParams.mode || ""}><option value="">Any way</option>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Term<select name="term" defaultValue={searchParams.term || ""}><option value="">Any term</option>{terms().map((t) => <option key={t}>{t}</option>)}</select></label>
        <button className="btn btn-sm">Show</button>{(searchParams.q || searchParams.uni || searchParams.mode || searchParams.term) && <Link href="/catalog" className="small-note">Clear</Link>}
      </form>
      {!rows ? <div className="err">{CONSORTIUM_HINT}</div> : !rows.length ? <div className="card small-note">No courses match. Member universities add courses each term.</div> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {rows.map((r) => (
            <Link key={r.id} href={`/catalog/${r.id}`} className="card" style={{ margin: 0, display: "grid", gap: 6, color: "inherit", textDecoration: "none", borderTop: `4px solid ${MODE_COL[r.mode] || "#555"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}><b style={{ color: MODE_COL[r.mode] }}>{modeLabel(r.mode)}</b><span>{r.term}</span></div>
              <div><span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, color: "#556" }}>{r.course.code}</span><div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{r.course.title}</div></div>
              <div style={{ fontSize: 13 }}>{r.university}{r.city ? <span className="small-note"> · {r.city}</span> : null}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                <span><b>{r.course.creditHours}</b>{r.lab ? ` (${r.course.creditHours - r.lab}+${r.lab})` : ""} CH</span>
                <span>{r.feePerCredit ? `${r.currency} ${(r.feePerCredit * r.course.creditHours).toLocaleString()}` : "No fee"}</span>
                <span style={{ color: r.seatsLeft ? "#2E7D32" : "#C62828", fontWeight: 700 }}>{r.seatsLeft ? `${r.seatsLeft} seat${r.seatsLeft > 1 ? "s" : ""} left` : "Full"}</span>
                {!r.open && <span style={{ color: "#C62828" }}>applications closed</span>}
              </div>
              <div className="small-note">{r.course.instructor ? `Taught by ${r.course.instructor.name}` : "Instructor to be announced"} · {r.course.clos.length} learning outcomes{isOdl(r.mode) && r.lab ? " · lab on campus" : ""}</div>
            </Link>))}
        </div>}
    </main>
  );
}
