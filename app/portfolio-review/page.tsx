import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { pdb, courseSampling, KINDS } from "../../lib/portfolio";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Accreditation reviewers: sampled scripts per course and CLO, and students' portfolio entries waiting for verification.
export default async function PortfolioReview({ searchParams }: { searchParams: { course?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{c}</Shell>;
  const tab = searchParams.tab === "students" ? "students" : "courses";
  const tabs = <nav className="tabs" style={{ marginBottom: 10 }}><a className="tab" href="/portfolio-review" aria-current={tab === "courses" ? "page" : undefined}>Course work samples</a><a className="tab" href="/portfolio-review?tab=students" aria-current={tab === "students" ? "page" : undefined}>Student portfolios</a></nav>;

  if (tab === "students") {
    const studs = await prisma.student.findMany({ where: { batch: where }, select: { id: true, name: true, rollNumber: true } });
    const sOf = new Map(studs.map((s) => [s.id, s]));
    const items = ((await pdb.studentPortfolioItem.findMany({ where: { studentId: { in: studs.map((s) => s.id) } }, orderBy: [{ verifiedAt: "asc" }, { createdAt: "desc" }], take: 300 }).catch(() => null)) as { id: string; studentId: string; title: string; kind: string; description: string | null; link: string | null; fileUrl: string | null; fileName: string | null; ploCodes: string | null; verifiedAt: Date | null }[] | null);
    const kn = new Map(KINDS);
    return shell(<>
      <h1 style={{ fontSize: 22 }}>Portfolio review</h1>{tabs}
      {items === null ? <div className="err">Run prisma/migration_portfolio.sql first.</div> : (
        <div className="card">{items.map((i) => (
          <div key={i.id} style={{ borderTop: "1px solid #E3E9F0", padding: "8px 0", fontSize: 13.5 }}>
            <b>{i.title}</b> <span className="small-note">{sOf.get(i.studentId)?.rollNumber} {sOf.get(i.studentId)?.name} · {kn.get(i.kind) || i.kind}{i.ploCodes ? ` · ${i.ploCodes}` : ""}</span>
            {i.description && <div>{i.description}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{i.link && <a href={i.link} target="_blank" rel="noopener noreferrer">link</a>}{i.fileUrl && <a href={i.fileUrl} target="_blank" rel="noopener noreferrer">{i.fileName || "file"}</a>}
              {i.verifiedAt ? <><span style={{ color: "#1F5E36", fontWeight: 700 }}>✓ Verified</span><ActionButton url="/api/portfolio-review" body={{ id: i.id, undo: true }} label="Undo" className="btn btn-secondary btn-sm" /></> : <ActionButton url="/api/portfolio-review" body={{ id: i.id }} label="Verify" />}</div>
          </div>))}
          {!items.length && <p className="small-note">No portfolio entries yet.</p>}</div>)}
    </>);
  }

  const courses = await prisma.course.findMany({ where: { batch: where }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: [{ code: "asc" }], take: 600 });
  const counts = new Map<string, number>();
  ((await pdb.studentWorkSample.groupBy({ by: ["courseId"], _count: { _all: true }, where: { courseId: { in: courses.map((c) => c.id) } } }).catch(() => [])) as { courseId: string; _count: { _all: number } }[]).forEach((r) => counts.set(r.courseId, r._count._all));
  const sel = searchParams.course ? courses.find((c) => c.id === searchParams.course) : null;
  const data = sel ? await courseSampling(sel.id) : null;
  const byClo = new Map<string, NonNullable<typeof data>["items"]>();
  if (data) for (const i of data.items) for (const c of i.clos.length ? i.clos : ["No CLO"]) byClo.set(c, [...(byClo.get(c) || []), i]);
  const lvName: Record<string, string> = { HIGH: "Best", MEDIUM: "Average", LOW: "Weakest" };
  return shell(<>
    <h1 style={{ fontSize: 22 }}>Portfolio review</h1>{tabs}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,300px) 1fr", gap: 12 }}>
      <div className="card" style={{ maxHeight: 640, overflowY: "auto", fontSize: 13 }}>
        {courses.map((c) => <div key={c.id} style={{ padding: "3px 0" }}><Link href={`/portfolio-review?course=${c.id}`} style={{ fontWeight: sel?.id === c.id ? 700 : 400 }}>{c.code} {c.title}</Link> <span className="small-note">{c.batch?.batchName} · {counts.get(c.id) || 0} samples</span></div>)}
        {!courses.length && <p className="small-note">No courses.</p>}
      </div>
      <div style={{ minWidth: 0 }}>
        {!sel ? <p className="small-note">Choose a course to see its sampled scripts by CLO.</p> : (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{sel.code} {sel.title}</h3>
            {Array.from(byClo.entries()).sort().map(([clo, its]) => (
              <div key={clo} style={{ marginBottom: 10 }}>
                <b>{clo}</b>
                <table><thead><tr><th>Assessment</th><th>Best</th><th>Average</th><th>Weakest</th></tr></thead>
                  <tbody>{its.map((i) => <tr key={i.id}><td>{i.label}</td>{["HIGH", "MEDIUM", "LOW"].map((l) => { const s = i.samples.find((x) => x.level === l); return <td key={l}>{s ? <><a href={s.fileUrl} target="_blank" rel="noopener noreferrer">{s.student?.rollNumber || lvName[l]}</a> <span className="small-note">{s.score ?? ""}/{i.maxScore}</span></> : <span style={{ color: "#B3261E" }}>missing</span>}</td>; })}</tr>)}</tbody></table>
              </div>))}
            {!byClo.size && <p className="small-note">No assessments yet.</p>}
          </div>)}
      </div>
    </div>
  </>);
}
