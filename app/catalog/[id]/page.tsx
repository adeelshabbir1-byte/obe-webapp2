import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { catalog, modeLabel, isOdl } from "../../../lib/consortiumOfferings";
import { recognisedAt } from "../../../lib/consortiumAgreements";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium course" };

export default async function CatalogCourse({ params }: { params: { id: string } }) {
  const [r] = await catalog({ id: params.id }).catch(() => []);
  if (!r) notFound();
  const st = await getAuthenticatedStudent().catch(() => null);
  let counts: string | null = null, home: string | null = null, mine = false;
  if (st) {
    const b = await prisma.batch.findUnique({ where: { id: st.batchId }, select: { coordinatorId: true } });
    home = b ? await findOwningChairmanId(b.coordinatorId) : null;
    mine = home === r.chairmanId;
    if (home && !mine && r.course.masterCourseId) {
      const as = await recognisedAt(home, r.course.masterCourseId);
      if (as.length) { const mc = await prisma.masterCourse.findMany({ where: { id: { in: as } }, select: { code: true, title: true } }); counts = mc.map((x) => `${x.code} ${x.title}`).join(", "); }
    }
  }
  const box = { border: "1px solid var(--line, #E1E5EA)", borderRadius: 10, padding: "10px 12px" };
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/catalog">← Course catalog</Link></p>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1565C0", marginTop: 8 }}>{modeLabel(r.mode)} · {r.term}</div>
      <h1 style={{ fontSize: 26, margin: "2px 0" }}><span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 16, color: "#556" }}>{r.course.code}</span> {r.course.title}</h1>
      <p style={{ margin: "0 0 12px", fontSize: 15 }}>{r.university}{r.city ? `, ${r.city}` : ""}{r.course.batch?.degreeProgram ? <span className="small-note"> · part of its {r.course.batch.degreeProgram}</span> : null}</p>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, fontSize: 13 }}>
        <div style={box}><div className="small-note">Credit hours</div><b style={{ fontSize: 18 }}>{r.course.creditHours}</b>{r.lab ? ` = ${r.course.creditHours - r.lab} theory + ${r.lab} lab` : ""}</div>
        <div style={box}><div className="small-note">Fee</div><b style={{ fontSize: 18 }}>{r.feePerCredit ? `${r.currency} ${(r.feePerCredit * r.course.creditHours).toLocaleString()}` : "None"}</b>{r.feePerCredit ? <div className="small-note">{r.currency} {r.feePerCredit.toLocaleString()} per credit hour, paid to {r.university}</div> : null}</div>
        <div style={box}><div className="small-note">Seats</div><b style={{ fontSize: 18, color: r.seatsLeft ? "#2E7D32" : "#C62828" }}>{r.seatsLeft ? `${r.seatsLeft} left` : "Full"}</b> of {r.seats}</div>
        <div style={box}><div className="small-note">Dates</div>{r.startsOn ? <>Starts {r.startsOn.toISOString().slice(0, 10)}<br /></> : null}{r.deadline ? <>Apply by {r.deadline.toISOString().slice(0, 10)}</> : "Apply any time before it starts"}</div>
      </div>
      <div className="card" style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
        <div><b>Instructor:</b> {r.course.instructor?.name || "to be announced"}</div>
        {r.schedule && <div><b>Classes:</b> {r.schedule}</div>}
        {r.lab > 0 && <div><b>Lab (face-to-face):</b> {r.labArrangement || "on the host campus"}</div>}
        <div><b>Prerequisite:</b> {r.course.prerequisiteCourse ? `${r.course.prerequisiteCourse.code} ${r.course.prerequisiteCourse.title} (or its equivalent at your university)` : "none"}</div>
        <div><b>Final exam:</b> proctored{isOdl(r.mode) ? " (HEC ODL policy)" : ""} at {r.centres.length ? r.centres.map((c) => `${c.name}${c.city ? `, ${c.city}` : ""}`).join(" · ") : "the host campus"} — you choose a centre your own university also approves.</div>
        {r.about && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.about}</p>}
        {r.course.catalogDescription && <p className="small-note" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.course.catalogDescription}</p>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>What you will be able to do</h3>
        {!r.course.clos.length ? <p className="small-note">The learning outcomes are being finalised.</p> : <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>{r.course.clos.map((c) => <li key={c.code} style={{ marginBottom: 4 }}>{c.statement} <span className="small-note">({c.bloomLevel})</span></li>)}</ol>}
      </div>
      <div className="card" style={{ borderLeft: `4px solid ${counts ? "#2E7D32" : "#1565C0"}` }}>
        {!st ? <>Students of member universities apply from their own student portal. <Link href="/student/login">Sign in</Link> to see whether this course counts toward your degree.</>
          : mine ? <>This is your own university&apos;s course — register for it in the usual way.</>
          : counts ? <><b style={{ color: "#2E7D32" }}>Counts at your university</b> as {counts}. Apply from your student portal: <Link href="/student/consortium">Consortium courses</Link>.</>
          : <>Your university has not recognised this course yet. You can still apply; your Chairman and Subject Expert decide whether it counts toward your degree. <Link href="/student/consortium">Consortium courses</Link></>}
      </div>
    </main>
  );
}
