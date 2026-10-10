import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { planProgress } from "../../lib/deadlines";
import { OVERVIEW_ROLES, leadsInScope } from "../../lib/readinessScope";

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const box = { background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px" } as const;

function Tile({ n, label, href, bad }: { n: number; label: string; href: string; bad?: boolean }) {
  return (
    <Link href={href} style={{ ...box, textDecoration: "none", color: "inherit", display: "block", borderLeft: `4px solid ${n === 0 ? "#2E7D4F" : bad ? "#B3261E" : "#B7791F"}` }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13 }}>{label}</div>
    </Link>
  );
}

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const now = new Date();
  const [lines, openAsked, answered, splitWaiting, overdue, staleLib, lastChanges] = await Promise.all([
    planProgress(user),
    prisma.taskRequest.count({ where: { toId: user.id, status: "OPEN" } }),
    prisma.taskRequest.count({ where: { fromId: user.id, status: { in: ["RESPONDED", "DONE"] } } }),
    prisma.courseOwner.count({ where: { chairmanId, status: "PENDING" } as never }),
    prisma.deadline.findMany({ where: { assigneeId: user.id, completedAt: null, dueDate: { lt: now }, allCourses: false } as never, select: { id: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 10 }),
    prisma.libraryInfo.findUnique({ where: { chairmanId }, select: { updatedAt: true } }),
    prisma.changeLog.findMany({ where: { chairmanId } as never, orderBy: { createdAt: "desc" }, take: 5 }),
  ]) as unknown as [Awaited<ReturnType<typeof planProgress>>, number, number, number, { id: string; title: string; dueDate: Date }[], { updatedAt: Date } | null, { id: string; area: string; summary: string; createdAt: Date }[]];
  const { leads } = await leadsInScope(user);
  const offered = (await prisma.course.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) }, isOffered: true, isNonCredit: false } as never, select: { id: true, coordinatorId: true, instructorId: true, subjectExpertId: true }, take: 3000 })) as unknown as { id: string; coordinatorId: string; instructorId: string | null; subjectExpertId: string | null }[];
  const offeredIds = offered.map((c) => c.id).concat(["none"]);
  const staleCut = new Date(Date.now() - 14 * 86400000);
  const [studentRows, attRows, outFigs] = (await Promise.all([
    prisma.student.groupBy({ by: ["batchId"], _count: { _all: true }, where: { batch: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } } } } as never),
    prisma.attendanceRecord.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds } }, _max: { updatedAt: true } } as never),
    prisma.outcomeFigure.findMany({ where: { leadId: { in: leads.map((l) => l.id).concat(["none"]) } } as never, orderBy: { intakeYear: "desc" }, select: { leadId: true, intakeYear: true, admitted: true, graduated: true, droppedOut: true } }),
  ])) as unknown as [{ batchId: string; _count: { _all: number } }[], { courseId: string; _max: { updatedAt: Date | null } }[], { leadId: string; intakeYear: number; admitted: number; graduated: number; droppedOut: number }[]];
  const batchOwner = new Map<string, string>((await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } }, select: { id: true, coordinatorId: true } })).map((b) => [b.id as string, b.coordinatorId as string]));
  const studentsOf = new Map<string, number>();
  for (const r of studentRows) { const o = batchOwner.get(r.batchId); if (o) studentsOf.set(o, (studentsOf.get(o) || 0) + r._count._all); }
  const lastAtt = new Map<string, Date | null>(attRows.map((r) => [r.courseId, r._max.updatedAt]));
  const [cloRows, lectureRows, markRows] = (await Promise.all([
    prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds }, source: "SE" } as never, _count: { _all: true } } as never),
    prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds }, source: "SE" } as never, _count: { _all: true } } as never),
    prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds } }, _count: { _all: true } } as never),
  ])) as unknown as { courseId: string }[][];
  const hasClo = new Set(cloRows.map((r) => r.courseId)), hasPlan = new Set(lectureRows.map((r) => r.courseId)), hasMarks = new Set(markRows.map((r) => r.courseId));
  const perLead = leads.map((l) => {
    const cs = offered.filter((c) => c.coordinatorId === l.id);
    return { id: l.id, program: l.leadProgram || l.name, total: cs.length, noInstr: cs.filter((c) => !c.instructorId).length, noSe: cs.filter((c) => !c.subjectExpertId).length, noClo: cs.filter((c) => !hasClo.has(c.id)).length, noPlan: cs.filter((c) => !hasPlan.has(c.id)).length, noMarks: cs.filter((c) => !hasMarks.has(c.id)).length, noAtt: cs.filter((c) => { const d = lastAtt.get(c.id); return !d || d < staleCut; }).length, students: studentsOf.get(l.id) || 0, fig: outFigs.find((f) => f.leadId === l.id) || null };
  }).filter((r) => r.total > 0);
  const sumOf = (k: "total" | "noInstr" | "noSe" | "noClo" | "noPlan" | "noMarks" | "noAtt" | "students") => perLead.reduce((n, r) => n + r[k], 0);
  const behind = lines.filter((l) => l.state === "BEHIND").sort((a, b) => b.behind - a.behind);
  const risk = lines.filter((l) => l.state === "AT_RISK");
  const staleDays = staleLib ? Math.floor((now.getTime() - staleLib.updatedAt.getTime()) / 86400000) : null;
  return (
    <Shell roleLabel="Home" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Needs your attention</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>What is late, waiting for you, or waiting on others, as of today. Green means nothing to do.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 18 }}>
        <Tile n={behind.length} label="plan tasks behind" href="/semester-plan" bad />
        <Tile n={risk.length} label="plan tasks at risk" href="/semester-plan" />
        <Tile n={overdue.length} label="of your own tasks overdue" href="/deadlines" bad />
        <Tile n={openAsked} label="requests waiting for you" href="/requests" />
        <Tile n={answered} label="replies to read" href="/requests" />
        <Tile n={splitWaiting} label="course requests to accept" href="/course-split" />
      </div>
      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Courses offered this semester: {sumOf("total")}</h3>
        {perLead.length === 0 ? <p style={{ margin: 0, color: "var(--slate)" }}>No course is marked as offered yet. Program Leads mark them under Courses.</p> : (
          <table>
            <thead><tr><th>Program</th><th>Offered</th><th>No instructor</th><th>No Subject Expert</th><th>No CLOs</th><th>No lecture plan</th><th>No marks yet</th><th>Attendance not marked in 14 days</th><th></th></tr></thead>
            <tbody>
              {perLead.map((r) => <tr key={r.id}><td><b>{r.program}</b></td><td>{r.total}</td>{[r.noInstr, r.noSe, r.noClo, r.noPlan, r.noMarks, r.noAtt].map((n, i) => <td key={i} style={{ color: n ? "#B3261E" : "#2E7D4F", fontWeight: n ? 700 : 400 }}>{n}</td>)}<td><Link href={`/accreditation-overview/${r.id}`}>Report</Link></td></tr>)}
              <tr style={{ borderTop: "2px solid var(--line)" }}><td><b>All programs</b></td><td><b>{sumOf("total")}</b></td><td><b>{sumOf("noInstr")}</b></td><td><b>{sumOf("noSe")}</b></td><td><b>{sumOf("noClo")}</b></td><td><b>{sumOf("noPlan")}</b></td><td><b>{sumOf("noMarks")}</b></td><td><b>{sumOf("noAtt")}</b></td><td></td></tr>
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Students: {sumOf("students")} on record</h3>
        {perLead.length === 0 ? <p style={{ margin: 0, color: "var(--slate)" }}>No programs yet.</p> : (
          <table>
            <thead><tr><th>Program</th><th>Students now</th><th>Latest intake year</th><th>Admitted</th><th>Graduated</th><th>Dropped out</th><th>Dropout rate</th></tr></thead>
            <tbody>{perLead.map((r) => <tr key={r.id}><td><b>{r.program}</b></td><td>{r.students}</td>{r.fig ? <><td>{r.fig.intakeYear}</td><td>{r.fig.admitted}</td><td>{r.fig.graduated}</td><td>{r.fig.droppedOut}</td><td style={{ color: r.fig.admitted && r.fig.droppedOut / r.fig.admitted > 0.15 ? "#B3261E" : "inherit" }}>{r.fig.admitted ? `${Math.round((r.fig.droppedOut / r.fig.admitted) * 100)}%` : "—"}</td></> : <td colSpan={5} style={{ color: "var(--slate)" }}>No graduation figures entered yet</td>}</tr>)}</tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Most behind</h3>
        {behind.length === 0 ? <p style={{ margin: 0, color: "var(--slate)" }}>Nothing is behind the plan.</p> : (
          <table><thead><tr><th>Task</th><th>Role</th><th>Was due</th><th>Not done</th></tr></thead>
            <tbody>{behind.slice(0, 8).map((l) => <tr key={l.id}><td><b>{l.title}</b></td><td>{l.role || ""}</td><td>{day(l.dueDate)}</td><td style={{ color: "#B3261E" }}>{l.behind} of {l.total}</td></tr>)}</tbody></table>
        )}
        <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/semester-plan">Open the full semester plan and send reminders →</Link></p>
      </div>
      {overdue.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Your overdue tasks</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{overdue.map((o) => <li key={o.id}>{o.title}, due {day(o.dueDate)}</li>)}</ul>
        </div>
      )}
      {user.role === "CHAIRMAN" && staleDays !== null && staleDays > 120 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid #B7791F" }}>The library record was last updated {staleDays} days ago. <Link href="/resources">Check Resources</Link></div>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Latest changes to shared figures</h3>
        {lastChanges.length === 0 ? <p style={{ margin: 0, color: "var(--slate)", fontSize: 13 }}>Nothing recorded yet.</p> : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{lastChanges.map((c) => <li key={c.id}><b>{c.area}</b>: {c.summary} <span style={{ color: "var(--slate)" }}>({day(c.createdAt)})</span></li>)}</ul>}
        <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/yearly-summary">Yearly summary →</Link></p>
      </div>
    </Shell>
  );
}
