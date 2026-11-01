import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import Tabs from "../../../components/Tabs";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { Bank, Choose, Close, Excuse } from "./RemedyForms";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
type R = { id: string; courseId: string; instrumentId: string; prereqTopic: string; dependentCourseCode: string; dependentTopic: string; strength: string; avg: number; belowPct: number; cause: string | null; weakStudentsJson: string; status: string; remedy: string | null; remedyNote: string | null; dueBy: Date | null; afterPct: number | null; excuseReason: string | null; createdAt: Date };

// CQI remedies (Adeel prompt §26–27): weak prerequisite topics, what caused it, who is weak, the remedy, the re-check,
// the topic's remedy bank, Optional topics that can make time, and the PL's view of overdue cases.
export default async function RemediesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const pl = ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role);
  const myCourses = await prisma.course.findMany({ where: pl ? { coordinator: { managedById: cid }, isOffered: true, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) } : { isOffered: true, OR: [{ instructorId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }, { subjectExpertId: user.id }] }, select: { id: true, code: true, title: true, subjectExpertId: true } });
  const cases = ((await db.prereqRemedy?.findMany({ where: { courseId: { in: myCourses.map((c) => c.id).concat("none") } }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => [])) || []) as R[];
  const students = new Map((await prisma.student.findMany({ where: { id: { in: cases.flatMap((c) => JSON.parse(c.weakStudentsJson) as string[]).slice(0, 2000).concat("none") } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, `${s.rollNumber} ${s.name}`]));
  const bank = ((await db.topicRemedy?.findMany({ where: { chairmanId: cid } }).catch(() => [])) || []) as { courseCode: string; topic: string; video: string | null; examples: string | null; practice: string | null; quiz: string | null }[];
  const optional = ((await db.topicMeta?.findMany({ where: { courseId: { in: myCourses.map((c) => c.id).concat("none") }, importance: "OPTIONAL" }, select: { courseId: true, lectureRowId: true } }).catch(() => [])) || []) as { courseId: string; lectureRowId: string }[];
  const optRows = new Map((await prisma.lectureRow.findMany({ where: { id: { in: optional.map((o) => o.lectureRowId).concat("none") } }, select: { id: true, topic: true, lectureNumber: true } })).map((r) => [r.id, r]));
  const tab = searchParams.tab || "cases";
  const code = new Map(myCourses.map((c) => [c.id, c.code]));
  const label: Record<string, string> = { OPEN: "🔴 remedy needed", SUGGESTION: "suggestion (weak link)", CHOSEN: "remedy chosen", EFFECTIVE: "✅ closed — effective", NEEDS_MORE: "🟠 not enough yet", EXCUSED: "excused", CROSS: "next course warned" };
  const seCourses = myCourses.filter((c) => c.subjectExpertId === user.id);
  const topics = seCourses.length ? await prisma.lectureRow.findMany({ where: { courseId: { in: seCourses.map((c) => c.id) }, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { courseId: true, topic: true } }) : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>CQI remedies</h1>
      <p className="small-note">When the class does badly on a topic that a later topic needs, choose a remedy before the later topic is taught: re-teach, a tutorial for the weak students, or practice + a short re-quiz. Record the re-check to close the loop; it is kept as CQI evidence. Thresholds and the deadline are in Who Decides What.</p>
      <Tabs base="/cqi/remedies" current={tab} tabs={[{ key: "cases", label: "Weak prerequisite topics", badge: cases.filter((c) => c.status === "OPEN").length || null, warn: true }, ...(seCourses.length ? [{ key: "bank", label: "Remedy bank (SE)" }] : [])]} />
      {tab === "cases" && (cases.length === 0 ? <div className="card"><p>No weak prerequisite topics ✓</p></div> : cases.map((r) => {
        const weak = (JSON.parse(r.weakStudentsJson) as string[]);
        const mat = bank.find((b) => b.courseCode.toUpperCase() === (code.get(r.courseId) || "").toUpperCase() && b.topic.toLowerCase() === r.prereqTopic.toLowerCase());
        const opt = optional.filter((o) => o.courseId === r.courseId).map((o) => optRows.get(o.lectureRowId)).filter(Boolean).slice(0, 4);
        return (
          <div className="card" key={r.id} style={{ marginBottom: 8, borderLeft: `4px solid ${r.status === "OPEN" ? "#B3261E" : r.status === "EFFECTIVE" ? "#1B6B3A" : "#B26A00"}` }}>
            <div style={{ fontSize: 13.5 }}><b>{code.get(r.courseId)}: {r.prereqTopic}</b> — average {r.avg}%, {r.belowPct}% below the pass mark · needed by <b>{r.dependentCourseCode} {r.dependentTopic}</b> · {label[r.status] || r.status}{r.dueBy && r.status === "OPEN" ? ` · due ${new Date(r.dueBy).toLocaleDateString("en-GB")}` : ""}</div>
            {r.cause && <div className="small-note">Why: {r.cause}</div>}
            <details><summary className="small-note" style={{ cursor: "pointer" }}>{weak.length} weak student{weak.length === 1 ? "" : "s"} (invite only them to a tutorial)</summary><div style={{ fontSize: 12 }}>{weak.map((id) => students.get(id) || id).join(" · ")}</div></details>
            {mat && <div style={{ fontSize: 12.5 }}>Remedy material: {[mat.video && <a key="v" href={mat.video}>video</a>, mat.examples && `examples: ${mat.examples}`, mat.practice && `practice: ${mat.practice}`, mat.quiz && `re-quiz: ${mat.quiz}`].filter(Boolean).map((x, i) => <span key={i} style={{ marginRight: 8 }}>{x}</span>)}</div>}
            {opt.length > 0 && r.remedy !== "TUTORIAL" && <div className="small-note">To make time: Optional topics that can be shortened — {opt.map((o) => `L${o!.lectureNumber} ${o!.topic}`).join(", ")}.</div>}
            <div style={{ marginTop: 6 }}>
              {(r.status === "OPEN" || r.status === "SUGGESTION" || r.status === "NEEDS_MORE") && !pl && <Choose id={r.id} />}
              {r.status === "CHOSEN" && <>{r.remedy?.toLowerCase()}{r.remedyNote ? ` — ${r.remedyNote}` : ""} · <Close id={r.id} /></>}
              {r.status === "OPEN" && pl && <Excuse id={r.id} />}
              {r.afterPct != null && <span className="small-note"> re-check {r.afterPct}%</span>}
              {r.excuseReason && <span className="small-note"> excused: {r.excuseReason}</span>}
            </div>
          </div>
        );
      }))}
      {tab === "bank" && <div className="card">{seCourses.map((c) => <div key={c.id} style={{ marginBottom: 10 }}><b>{c.code} {c.title}</b>{Array.from(new Set(topics.filter((t) => t.courseId === c.id).map((t) => t.topic))).map((t) => { const v = bank.find((b) => b.courseCode.toUpperCase() === c.code.toUpperCase() && b.topic === t) || {}; return <div key={t} style={{ fontSize: 12.5, margin: "3px 0" }}>{t}: <Bank code={c.code} topic={t} v={v} /></div>; })}</div>)}
        <p className="small-note">Set once; every teacher of the course (and followers) sees it on a weak topic.</p></div>}
    </Shell>
  );
}
