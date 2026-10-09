import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import DeadlineForm from "../../components/DeadlineForm";
import DeadlineRowActions from "../../components/DeadlineRowActions";
import { DEADLINE_KINDS, SETTER_ROLES, STATUS_COLOUR, STATUS_TEXT, chairmanOf, detectDone, reach, statusOf, type DlStatus } from "../../lib/deadlines";
import { ROLE_TEXT } from "../../lib/institutePeople";

type DlRow = { id: string; assigneeId: string; setById: string; kind: string; title: string; description: string | null; courseId: string | null; dueDate: Date; completedAt: Date | null };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DeadlinesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const isSetter = SETTER_ROLES.includes(user.role);
  const chairmanId = chairmanOf(user);

  const { people, leadIds } = isSetter ? await reach(user) : { people: [], leadIds: [] as string[] };
  const peopleIds = people.map((p) => p.id);
  const rows = (await prisma.deadline.findMany({
    where: { chairmanId, OR: [{ assigneeId: user.id }, ...(isSetter ? [{ setById: user.id }, { assigneeId: { in: peopleIds.length ? peopleIds : ["none"] } }] : [])] },
    orderBy: { dueDate: "asc" },
    take: 400,
  })) as unknown as DlRow[];

  // Work saved in the course marks the deadline done: note the first time we see it.
  let checked = 0;
  for (const d of rows) {
    if (d.completedAt || !d.courseId || checked >= 80) continue;
    checked++;
    if (await detectDone(d.kind, d.courseId, d.assigneeId)) {
      d.completedAt = new Date();
      await prisma.deadline.update({ where: { id: d.id }, data: { completedAt: d.completedAt } });
    }
  }

  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap((r) => [r.assigneeId, r.setById]))) } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  const courseIds = Array.from(new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x)));
  const courseLabel = new Map<string, string>((await prisma.course.findMany({ where: { id: { in: courseIds.length ? courseIds : ["none"] } }, select: { id: true, code: true, title: true } })).map((c) => [c.id as string, `${c.code} ${c.title}`]));
  const withStatus = rows.map((r) => ({ r, s: statusOf(r) }));
  const mine = withStatus.filter((x) => x.r.assigneeId === user.id);
  const team = withStatus.filter((x) => x.r.assigneeId !== user.id);

  // Per-person summary
  const per = new Map<string, Record<DlStatus, number>>();
  for (const { r, s } of team) {
    const m = per.get(r.assigneeId) || { ON_TIME: 0, LATE_DONE: 0, OVERDUE: 0, SOON: 0, UPCOMING: 0 };
    m[s]++; per.set(r.assigneeId, m);
  }
  const summary = Array.from(per.entries()).map(([id, m]) => {
    const judged = m.ON_TIME + m.LATE_DONE + m.OVERDUE;
    return { id, name: names.get(id) || "—", m, rate: judged ? Math.round((m.ON_TIME / judged) * 100) : null };
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

  // Courses a deadline can be about: those where the person is Subject Expert or Instructor
  const courseOpts = isSetter && leadIds.length
    ? (await prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true, batch: { select: { batchName: true } } }, orderBy: { code: "asc" }, take: 800 }))
        .map((c) => ({ id: c.id, label: `${c.code} ${c.title}${c.batch ? ` (${c.batch.batchName})` : ""}`, people: [c.subjectExpertId, c.instructorId].filter((x): x is string => !!x) }))
    : [];

  const badge = (s: DlStatus) => <span style={{ background: STATUS_COLOUR[s], color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11.5, whiteSpace: "nowrap" }}>{STATUS_TEXT[s]}</span>;
  const table = (list: typeof withStatus, showWho: boolean) => (
    <table>
      <thead><tr><th>Due</th>{showWho && <th>Person</th>}<th>What</th><th>Course</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.map(({ r, s }) => (
        <tr key={r.id}>
          <td style={{ whiteSpace: "nowrap" }}>{day(r.dueDate)}</td>
          {showWho && <td>{names.get(r.assigneeId) || "—"}</td>}
          <td><b>{r.title}</b>{r.kind !== "CUSTOM" && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{DEADLINE_KINDS[r.kind]}</div>}{r.description && <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.description}</div>}
            {!showWho && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>Set by {names.get(r.setById) || "—"}</div>}</td>
          <td style={{ fontSize: 12.5 }}>{r.courseId ? courseLabel.get(r.courseId) || "—" : "—"}</td>
          <td>{badge(s)}{r.completedAt && <div style={{ fontSize: 11, color: "var(--slate)" }}>on {day(r.completedAt)}</div>}</td>
          <td><DeadlineRowActions id={r.id} canTick={!r.courseId && (r.assigneeId === user.id || r.setById === user.id)} done={!!r.completedAt} canRemove={isSetter && (user.role === "CHAIRMAN" || r.setById === user.id)} /></td>
        </tr>
      ))}</tbody>
    </table>
  );

  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Deadlines"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Deadlines</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        {isSetter ? "Set deadlines for the people in your area and see who is on time and who is late." : "The deadlines set for you."}
      </p>
      {isSetter && <DeadlineForm people={people.map((p) => ({ id: p.id, name: `${p.name} (${ROLE_TEXT[p.role] || p.role})`, role: p.role }))} courses={courseOpts} />}
      {isSetter && summary.length > 0 && (
        <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Who is on time</h3>
          <table>
            <thead><tr><th>Person</th><th>On time</th><th>Done late</th><th>Overdue now</th><th>Still to come</th><th>On-time rate</th></tr></thead>
            <tbody>{summary.map((p) => (
              <tr key={p.id}><td><b>{p.name}</b></td><td>{p.m.ON_TIME}</td><td style={{ color: p.m.LATE_DONE ? "#B7791F" : undefined }}>{p.m.LATE_DONE}</td>
                <td style={{ color: p.m.OVERDUE ? "#B3261E" : undefined, fontWeight: p.m.OVERDUE ? 700 : 400 }}>{p.m.OVERDUE}</td><td>{p.m.SOON + p.m.UPCOMING}</td>
                <td><b style={{ color: p.rate === null ? undefined : p.rate >= 80 ? "#2E7D4F" : p.rate >= 50 ? "#B7791F" : "#B3261E" }}>{p.rate === null ? "—" : `${p.rate}%`}</b></td></tr>
            ))}</tbody>
          </table>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>On-time rate = done on time ÷ (done on time + done late + overdue). Work saved in a course is stamped the first time it is seen, so a late discovery can read as later than it really was.</p>
        </div>
      )}
      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Set for me</h3>
        {mine.length === 0 ? <p style={{ color: "var(--slate)" }}>Nothing has been set for you.</p> : table(mine, false)}
      </div>
      {isSetter && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Set by me and my area</h3>
          {team.length === 0 ? <p style={{ color: "var(--slate)" }}>No deadlines set yet.</p> : table(team, true)}
        </div>
      )}
    </Shell>
  );
}
