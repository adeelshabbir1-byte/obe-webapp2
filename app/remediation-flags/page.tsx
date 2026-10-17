import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { topicScoresByStudent, remediationScope } from "../../lib/remediation";
import { rfdb, flaggableCourses, FLAG_ROLE } from "../../lib/remediationFlags";
import { ActionButton } from "../../components/fyp/FypClient";
import FlagMatrix from "../../components/FlagMatrix";

export const dynamic = "force-dynamic";
type Flag = { id: string; studentId: string; courseId: string; courseCode: string; topicsJson: string; reason: string | null; flaggedById: string; flaggedAs: string; status: string; planId: string | null; createdAt: Date };

// Flag students for remediation: the advisor (first of all), the teacher who taught the course, the teacher of the course
// that builds on it, the OMC and the Program Lead. Planners see every open flag and turn them into remediation plans.
export default async function RemediationFlagsPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Flag for Remediation</h1>{c}</Shell>;
  const mine = ((await rfdb.remediationFlag.findMany({ where: { flaggedById: user.id }, orderBy: { createdAt: "desc" }, take: 100 }).catch(() => null)) as Flag[] | null);
  if (mine === null) return shell(<div className="err">Run prisma/migration_remediation_flags.sql first.</div>);
  const courses = await flaggableCourses(user);
  const scope = await remediationScope(user).catch(() => null);
  const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  let matrix: React.ReactNode = null;
  const sel = courses.find((c) => c.id === searchParams.courseId);
  if (sel) {
    const data = await topicScoresByStudent(sel.id, cid);
    const course = await prisma.course.findUnique({ where: { id: sel.id }, select: { instructorId: true } });
    const wide = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) || course?.instructorId === user.id;
    let allowed = data.students;
    if (!wide) {
      const advisees = new Set((await prisma.student.findMany({ where: { batch: { advisorId: user.id } }, select: { id: true } })).map((s) => s.id));
      const teaching = new Set((await prisma.studentEnrollment.findMany({ where: { status: "ACTIVE", course: { instructorId: user.id, isOffered: true } }, select: { studentId: true } })).map((e) => e.studentId));
      allowed = data.students.filter((s) => advisees.has(s.id) || teaching.has(s.id));
    }
    matrix = data.topics.length ? <FlagMatrix courseId={sel.id} topics={data.topics.map((t) => ({ topic: t.topic, below: t.below, assessed: t.assessed, strong: t.strong }))} students={allowed} passPct={data.passPct} /> : <p className="small-note">This course has no topics with marked assessments yet.</p>;
  }
  const open = scope?.canPlan ? ((await rfdb.remediationFlag.findMany({ where: { chairmanId: scope.chairmanId, status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 1000 })) as Flag[]) : [];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set([...open, ...mine].map((f) => f.flaggedById))) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const studs = new Map((await prisma.student.findMany({ where: { id: { in: Array.from(new Set([...open, ...mine].map((f) => f.studentId))) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, `${s.rollNumber} ${s.name}`]));
  const groups = new Map<string, Flag[]>(); for (const f of open) groups.set(f.courseCode, [...(groups.get(f.courseCode) || []), f]);
  return shell(<>
    <p className="small-note">Anyone close to a struggling student can flag them: their advisor, the teacher who taught the course, the teacher of the course that builds on it (for example OOP after Programming Fundamentals), the OMC and the Program Lead. The planners turn flags into a remediation tutorial or a junior-class sitting with a micro-assessment.</p>
    <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><select name="courseId" defaultValue={sel?.id || ""} style={{ maxWidth: 520 }}><option value="">— choose a course the students took —</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><button className="btn btn-secondary btn-sm">Show topic scores</button></form>
    {sel && <div className="card"><h3 style={{ marginTop: 0 }}>{sel.label}</h3>{matrix}</div>}
    {open.length > 0 && <div className="card" style={{ borderLeft: "4px solid #B3261E" }}><h3 style={{ marginTop: 0 }}>Open flags ({open.length})</h3>
      <p className="small-note">Plan them on the <Link href="/remediation">Remediation</Link> page: when you create a plan for a course, its flagged students on those topics are added automatically and the people who flagged them are told.</p>
      {Array.from(groups.entries()).map(([code, fs]) => <div key={code} style={{ borderTop: "1px solid #E3E9F0", padding: "6px 0" }}><b>{code}</b> <span className="small-note">{new Set(fs.map((f) => f.studentId)).size} students · topics: {Array.from(new Set(fs.flatMap((f) => JSON.parse(f.topicsJson) as string[]))).join(", ")}</span>
        {fs.map((f) => <div key={f.id} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ minWidth: 220 }}>{studs.get(f.studentId)}</span><span style={{ fontSize: 11.5, padding: "1px 8px", borderRadius: 10, background: f.flaggedAs === "ADVISOR" ? "#7A3E9D" : "#4B5B6E", color: "#fff" }}>{FLAG_ROLE[f.flaggedAs]}</span><span className="small-note">{people.get(f.flaggedById)} · {(JSON.parse(f.topicsJson) as string[]).join(", ")}{f.reason ? ` · ${f.reason}` : ""}</span><ActionButton url="/api/remediation-flags" body={{ action: "dismiss", id: f.id }} label="Dismiss" className="btn btn-secondary btn-sm" /></div>)}</div>)}</div>}
    <div className="card"><h3 style={{ marginTop: 0 }}>My flags</h3>
      {mine.map((f) => <div key={f.id} style={{ fontSize: 13 }}>{studs.get(f.studentId)} · <b>{f.courseCode}</b> · {(JSON.parse(f.topicsJson) as string[]).join(", ")} · <span style={{ color: f.status === "PLANNED" ? "#1F5E36" : f.status === "DISMISSED" ? "#7A8796" : "#A35A00" }}>{f.status === "PLANNED" ? "in a remediation plan" : f.status === "DISMISSED" ? "dismissed" : "waiting for a plan"}</span> {f.planId && <Link href={`/remediation/${f.planId}`}>open plan</Link>} {f.status === "OPEN" && <ActionButton url="/api/remediation-flags" body={{ action: "withdraw", id: f.id }} label="Withdraw" className="btn btn-secondary btn-sm" />}</div>)}
      {!mine.length && <p className="small-note">You have not flagged anyone yet.</p>}</div>
  </>);
}
