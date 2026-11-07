import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import * as W from "../../../lib/workflowGaps";
import { NoteForm } from "../../../components/WorkflowForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course CQI report" };

// Queue item 19: one report per course — marks per CLO, the students' own confidence, the teacher's exit review,
// the CQI records of this course code, notes and "students struggled" flags per topic, and "it worked" notes.
export default async function CourseCqi({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await W.coursePeople(params.courseId);
  if (!c || !(await W.canSeeCourse(user as never, c))) notFound();
  const r = await W.courseCqi(c.id);
  if (!r) notFound();
  const lectures = (await prisma.lectureRow.findMany({ where: { courseId: c.id, source: "SE" }, select: { lectureNumber: true, topic: true }, orderBy: { lectureNumber: "asc" } })).map((l) => ({ n: l.lectureNumber, topic: l.topic }));
  const cid = await chairmanIdFor(user as never);
  const people = await prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 400 });
  const pname = new Map(people.map((p) => [p.id, p.name]));
  const struggle = new Map<number, number>(); for (const n of r.notes || []) if (n.kind === "STRUGGLE" && n.lectureNumber != null) struggle.set(n.lectureNumber, (struggle.get(n.lectureNumber) || 0) + 1);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{c.code} — {c.title}: course CQI report</h1>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>CLO results and students&apos; confidence</h3>
        {!r.self.clos.length ? <p className="small-note">No CLO results or student ratings yet.</p> :
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>CLO</th><th>Marks (direct)</th><th>Students&apos; confidence</th><th>Ratings</th><th>Where they disagree</th></tr></thead>
            <tbody>{r.self.clos.map((x) => <tr key={x.code}><td>{x.code}</td><td>{x.direct ?? "—"}%</td><td>{x.self ?? "—"}%</td><td>{x.n}</td><td style={{ color: x.flag ? "#B26A00" : undefined }}>{x.flag || "—"}</td></tr>)}</tbody></table>}</div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Teacher&apos;s exit review</h3>{r.review?.submittedAt ? <div style={{ fontSize: 13 }}><b>What worked:</b> {r.review.worked || "—"}<br /><b>Challenges:</b> {r.review.challenges || "—"}<br /><b>Changes for next time:</b> {r.review.changes || "—"}</div> : <p className="small-note">Not submitted yet.</p>}</div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>CQI records for {c.code}</h3>
        {!r.cqis.length ? <p className="small-note">None.</p> : <table className="table" style={{ fontSize: 12.5 }}><tbody>{r.cqis.map((q) => <tr key={q.id}><td>{q.createdAt.toISOString().slice(0, 10)}</td><td>{q.finding}</td><td>{q.actionTaken || "—"}</td><td>{q.status}</td></tr>)}</tbody></table>}</div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Notes on topics</h3>
        {r.notes === null ? <p className="small-note">{W.WG_HINT}</p> : <>
          <NoteForm courseId={c.id} lectures={lectures} people={people} cqis={r.cqis.map((q) => ({ id: q.id, finding: q.finding }))} />
          {Array.from(struggle.entries()).filter(([, n]) => n >= W.STRUGGLE_SUGGEST).map(([l, n]) => <p key={l} style={{ fontSize: 13, color: "#B26A00", margin: "6px 0 0" }}>Lecture {l}: {n} &quot;students struggled&quot; flags — consider a plan change for OMC sign-off.</p>)}
          <ul style={{ fontSize: 12.5, margin: "8px 0 0 18px" }}>{r.notes.map((n) => <li key={n.id}>{n.at.toISOString().slice(0, 10)} · {pname.get(n.userId) || "someone"} · {n.kind === "STRUGGLE" ? "struggled" : n.kind === "WORKED" ? `it worked → ${pname.get(n.toUserId || "") || ""}` : "note"}{n.lectureNumber != null ? ` · lecture ${n.lectureNumber}` : ""}: {n.text}</li>)}</ul></>}</div>
    </Shell>
  );
}
