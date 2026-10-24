import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { collegesOf, universityOf, metaOf } from "../../../lib/curriculumLibrary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliated colleges" };

// The university's view: its colleges, and which curriculum version each college batch follows.
export default async function Affiliates() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/home");
  const uni = await universityOf(user.id);
  const cols = await collegesOf(user.id);
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: { in: cols.map((c) => c.collegeId).concat("none") } } }, select: { id: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true } }, courses: { where: { masterCourseId: { not: null } }, select: { masterCourse: { select: { masterCurriculum: { select: { id: true, title: true, version: true, chairmanId: true } } } } }, take: 1 } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const meta = await metaOf(batches.map((b) => b.courses[0]?.masterCourse?.masterCurriculum.id || "none"));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Affiliated colleges</h1>
      {uni && <div className="card">Your institute is itself affiliated to another university; see <Link href="/curricula">Curriculum Library</Link>.</div>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Colleges linked to your university by OBEHUB (ask the Super User to add one). They follow your own curricula — publish a new version in the <Link href="/curricula">Curriculum Library</Link> with an “effective from” term and they are told. Inspections and renewals are kept in the <Link href="/quality-office/affiliate">Quality Office</Link>. Colleges have no Subject Experts and no OMC: your Subject Experts design each course and your OMC monitors the colleges&apos; courses too. Set each course&apos;s marks distribution and enter your own parts (e.g. the final) under <Link href="/affiliates/marks">Affiliated Colleges — Marks</Link>.</p>
      {cols.length === 0 ? <div className="card small-note">No colleges linked yet.</div> : cols.map((c) => {
        const bs = batches.filter((b) => b.coordinator.managedById === c.collegeId);
        return (
          <div key={c.collegeId} className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>{c.head?.instituteName || c.head?.name} <span className="small-note">{c.status.toLowerCase()}{c.since ? ` since ${c.since.toISOString().slice(0, 10)}` : ""}</span></h3>
            {bs.length === 0 ? <p className="small-note">No batches yet.</p> : <table style={{ fontSize: 12.5 }}><thead><tr><th>Batch</th><th>Intake</th><th>Follows</th></tr></thead>
              <tbody>{bs.map((b) => { const cur = b.courses[0]?.masterCourse?.masterCurriculum; const ours = cur?.chairmanId === user.id; return (
                <tr key={b.id}><td>{b.degreeProgram} — {b.batchName}</td><td>{b.startTerm} {b.startYear}</td>
                  <td style={{ color: cur && !ours ? "#C62828" : undefined }}>{cur ? `${meta.get(cur.id)?.code || `${cur.title} ${cur.version}`}${ours ? "" : " — not your curriculum"}` : "no curriculum imported"}</td></tr>); })}</tbody></table>}
          </div>
        );
      })}
    </Shell>
  );
}
