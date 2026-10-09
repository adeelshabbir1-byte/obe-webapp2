import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import DeadlineForm from "../../components/DeadlineForm";
import DeadlineRowActions from "../../components/DeadlineRowActions";
import { DEADLINE_KINDS, KIND_ROLE, ROLE_LABEL, SETTER_ROLES, STATUS_COLOUR, STATUS_TEXT, chairmanOf, detectDone, reach, statusOf, type DlStatus } from "../../lib/deadlines";
import { ROLE_TEXT } from "../../lib/institutePeople";
import { hatsOf } from "../../lib/dualRoles";

type DlRow = { id: string; assigneeId: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; courseId: string | null; dueDate: Date; completedAt: Date | null };
type Person = { id: string; name: string };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function DeadlinesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const isSetter = SETTER_ROLES.includes(user.role);
  const chairmanId = chairmanOf(user);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true } });
  const myHats = me ? hatsOf({ rawRole: me.role, secondaryRole: me.secondaryRole, tertiaryRole: me.tertiaryRole, extraRoles: me.extraRoles }) : [user.role];

  const { people, leadIds } = isSetter ? await reach(user) : { people: [], leadIds: [] as string[] };
  const peopleIds = people.map((p) => p.id);
  const [myCourses, scopeCourses] = await Promise.all([
    prisma.course.findMany({ where: { OR: [{ subjectExpertId: user.id }, { instructorId: user.id }] }, select: { id: true } }),
    isSetter && leadIds.length ? prisma.course.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true, batch: { select: { batchName: true } } }, orderBy: { code: "asc" }, take: 800 }) : Promise.resolve([]),
  ]);
  const myCourseIds = myCourses.map((c) => c.id);
  const scopeIds = (scopeCourses as { id: string }[]).map((c) => c.id);

  const rows = (await prisma.deadline.findMany({
    where: { chairmanId, OR: [
      { assigneeId: user.id }, { setById: user.id }, { role: { in: myHats }, courseId: null },
      { courseId: { in: myCourseIds.length ? myCourseIds : ["none"] } },
      ...(isSetter ? [{ assigneeId: { in: peopleIds.length ? peopleIds : ["none"] } }, { courseId: { in: scopeIds.length ? scopeIds : ["none"] } }] : []),
    ] },
    orderBy: { dueDate: "asc" },
    take: 400,
  })) as unknown as DlRow[];

  // Who holds each course's roles right now
  const courseIds = Array.from(new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x)));
  const courseRows = (await prisma.course.findMany({ where: { id: { in: courseIds.length ? courseIds : ["none"] } }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true } })) as unknown as { id: string; code: string; title: string; subjectExpertId: string | null; instructorId: string | null }[];
  const courseOf = new Map(courseRows.map((c) => [c.id, c]));

  // Role tasks that are not about a course: whoever, in the setter's area, holds the role
  const setterPeople = new Map<string, (Person & { hats: string[] })[]>();
  setterPeople.set(user.id, people);
  async function peopleOfSetter(id: string) {
    if (setterPeople.has(id)) return setterPeople.get(id) as (Person & { hats: string[] })[];
    const s = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, managedById: true, facultyId: true, departmentId: true } });
    const p = s && SETTER_ROLES.includes(s.role) ? (await reach(s)).people : [];
    setterPeople.set(id, p); return p;
  }
  const holdersOf = async (r: DlRow): Promise<string[]> => {
    if (r.assigneeId) return [r.assigneeId];
    if (r.courseId) {
      const c = courseOf.get(r.courseId); if (!c) return [];
      const role = r.role || KIND_ROLE[r.kind];
      const id = role === "INSTRUCTOR" ? c.instructorId : c.subjectExpertId;
      return id ? [id] : [];
    }
    return r.role ? (await peopleOfSetter(r.setById)).filter((p) => p.hats.includes(r.role as string)).map((p) => p.id) : [];
  };

  // Work saved in the course marks the deadline done: note the first time we see it.
  let checked = 0;
  for (const d of rows) {
    if (d.completedAt || !d.courseId || checked >= 80) continue;
    checked++;
    if (await detectDone(d.kind, d.courseId, d.role || KIND_ROLE[d.kind])) {
      d.completedAt = new Date();
      await prisma.deadline.update({ where: { id: d.id }, data: { completedAt: d.completedAt } });
    }
  }

  const holders = new Map<string, string[]>();
  for (const r of rows) holders.set(r.id, await holdersOf(r));
  const allIds = Array.from(new Set([...rows.flatMap((r) => [r.setById, ...(holders.get(r.id) || [])])]));
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: allIds.length ? allIds : ["none"] } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  const withStatus = rows.map((r) => ({ r, s: statusOf(r), who: holders.get(r.id) || [] }));
  const mine = withStatus.filter((x) => x.who.includes(user.id) || (!x.r.courseId && !!x.r.role && myHats.includes(x.r.role) && x.r.assigneeId === null && x.r.setById !== user.id));
  const mineIds = new Set(mine.map((x) => x.r.id));
  const team = withStatus.filter((x) => !mineIds.has(x.r.id));

  // Per-person summary, by whoever holds the work now. Work nobody holds is listed on its own.
  const per = new Map<string, Record<DlStatus, number>>();
  let unheld = 0;
  for (const { s, who } of team) {
    if (who.length === 0) { if (s === "OVERDUE") unheld++; continue; }
    for (const id of who) {
      const m = per.get(id) || { ON_TIME: 0, LATE_DONE: 0, OVERDUE: 0, SOON: 0, UPCOMING: 0 };
      m[s]++; per.set(id, m);
    }
  }
  const summary = Array.from(per.entries()).map(([id, m]) => {
    const judged = m.ON_TIME + m.LATE_DONE + m.OVERDUE;
    return { id, name: names.get(id) || "—", m, rate: judged ? Math.round((m.ON_TIME / judged) * 100) : null };
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

  const courseOpts = (scopeCourses as { id: string; code: string; title: string; batch: { batchName: string } | null }[]).map((c) => ({ id: c.id, label: `${c.code} ${c.title}${c.batch ? ` (${c.batch.batchName})` : ""}` }));
  const roleOpts = Array.from(new Set(["SUBJECT_EXPERT", "INSTRUCTOR", ...people.flatMap((p) => p.hats)])).filter((r) => ROLE_LABEL[r]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  const badge = (s: DlStatus) => <span style={{ background: STATUS_COLOUR[s], color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11.5, whiteSpace: "nowrap" }}>{STATUS_TEXT[s]}</span>;
  const whoCell = (r: DlRow, who: string[]) => {
    const role = r.role || KIND_ROLE[r.kind];
    const label = r.assigneeId ? "" : role ? ROLE_LABEL[role] || role : "";
    return (
      <>
        {label && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{label}{r.courseId ? " of the course" : ""}</div>}
        {who.length ? who.map((id) => names.get(id) || "—").join(", ") : <span style={{ color: "#B3261E" }}>Nobody holds this yet</span>}
      </>
    );
  };
  const table = (list: typeof withStatus, showWho: boolean) => (
    <table>
      <thead><tr><th>Due</th>{showWho && <th>Who</th>}<th>What</th><th>Course</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.map(({ r, s, who }) => (
        <tr key={r.id}>
          <td style={{ whiteSpace: "nowrap" }}>{day(r.dueDate)}</td>
          {showWho && <td>{whoCell(r, who)}</td>}
          <td><b>{r.title}</b>{r.kind !== "CUSTOM" && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{DEADLINE_KINDS[r.kind]}</div>}{r.description && <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.description}</div>}
            {!showWho && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>Set by {names.get(r.setById) || "—"}</div>}</td>
          <td style={{ fontSize: 12.5 }}>{r.courseId ? (courseOf.get(r.courseId) ? `${courseOf.get(r.courseId)!.code} ${courseOf.get(r.courseId)!.title}` : "—") : "—"}</td>
          <td>{badge(s)}{r.completedAt && <div style={{ fontSize: 11, color: "var(--slate)" }}>on {day(r.completedAt)}</div>}</td>
          <td><DeadlineRowActions id={r.id} canTick={!r.courseId && (who.includes(user.id) || r.setById === user.id || (!!r.role && myHats.includes(r.role)))} done={!!r.completedAt} canRemove={isSetter && (user.role === "CHAIRMAN" || r.setById === user.id)} /></td>
        </tr>
      ))}</tbody>
    </table>
  );

  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Deadlines"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Deadlines</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        {isSetter ? "Set a deadline for a role or a task, whoever holds it, or for one named person, and see who is on time and who is late." : "The deadlines that belong to you or to your role."}
      </p>
      {isSetter && <DeadlineForm people={people.map((p) => ({ id: p.id, name: `${p.name} (${ROLE_TEXT[p.role] || p.role})` }))} courses={courseOpts} roles={roleOpts} />}
      {isSetter && unheld > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid #B3261E" }}>
          <b style={{ color: "#B3261E" }}>{unheld} overdue deadline{unheld > 1 ? "s" : ""} belong to a role nobody holds yet</b>
          <div style={{ fontSize: 12.5, color: "var(--slate)" }}>For example a course with no Subject Expert or Instructor assigned. Assign someone so the work can start.</div>
        </div>
      )}
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
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Each deadline counts for whoever holds the role now. On-time rate = done on time ÷ (done on time + done late + overdue). Work saved in a course is stamped the first time it is seen, so a late discovery can read as later than it really was.</p>
        </div>
      )}
      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>For me</h3>
        {mine.length === 0 ? <p style={{ color: "var(--slate)" }}>Nothing is due from you.</p> : table(mine, false)}
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
