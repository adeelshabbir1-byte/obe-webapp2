import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import DeadlineForm from "../../components/DeadlineForm";
import DeadlineRowActions from "../../components/DeadlineRowActions";
import { DEADLINE_KINDS, KIND_ROLE, ROLE_LABEL, SETTER_ROLES, STATUS_COLOUR, STATUS_TEXT, chairmanOf, stampDone, topUpStanding, reach, statusOf, workCourses, type DlStatus } from "../../lib/deadlines";
import { seProgressFor, instructorProgressFor } from "../../lib/seProgress";
import ProgressBar from "../../components/ProgressBar";
import Link from "next/link";
import MyTasksGantt, { type GanttTask } from "../../components/MyTasksGantt";
import { blockedByMe, taskDays } from "../../lib/taskDeps";
import { ROLE_TEXT } from "../../lib/institutePeople";
import { hatsOf } from "../../lib/dualRoles";

type DlRow = { id: string; assigneeId: string | null; role: string | null; setById: string; kind: string; title: string; description: string | null; courseId: string | null; dueDate: Date; completedAt: Date | null; planKey: string | null; planTerm: string | null };
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
  // Live courses only: offered now, or already given to someone for a current / future term (past terms are left out).
  const [myCourses, scopeWork] = await Promise.all([
    workCourses({ OR: [{ subjectExpertId: user.id }, { instructorId: user.id }, { coordinatorId: user.id }] }),
    isSetter && leadIds.length ? workCourses({ coordinatorId: { in: leadIds } }) : Promise.resolve([]),
  ]);
  const scopeCourses = scopeWork.length ? await prisma.course.findMany({ where: { id: { in: scopeWork.map((c) => c.id) } }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true, batch: { select: { batchName: true } } }, orderBy: { code: "asc" }, take: 800 }) : [];
  const myCourseIds = myCourses.map((c) => c.id);
  const scopeIds = (scopeCourses as { id: string }[]).map((c) => c.id);

  await topUpStanding(chairmanId);
  const rows = (await prisma.deadline.findMany({
    where: { chairmanId, allCourses: false, OR: [
      { assigneeId: user.id }, { setById: user.id }, { role: { in: myHats }, courseId: null },
      { courseId: { in: myCourseIds.length ? myCourseIds : ["none"] } },
      ...(isSetter ? [{ assigneeId: { in: peopleIds.length ? peopleIds : ["none"] } }, { courseId: { in: scopeIds.length ? scopeIds : ["none"] } }] : []),
    ] },
    orderBy: { dueDate: "asc" },
    take: 1500,
  })) as unknown as DlRow[];

  // Who holds each course's roles right now
  const courseIds = Array.from(new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x)));
  const courseRows = (await prisma.course.findMany({ where: { id: { in: courseIds.length ? courseIds : ["none"] } }, select: { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true } })) as unknown as { id: string; code: string; title: string; coordinatorId: string | null; subjectExpertId: string | null; instructorId: string | null }[];
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
      const id = role === "INSTRUCTOR" ? c.instructorId : role === "PROGRAM_COORDINATOR" ? c.coordinatorId : c.subjectExpertId;
      return id ? [id] : [];
    }
    return r.role ? (await peopleOfSetter(r.setById)).filter((p) => p.hats.includes(r.role as string)).map((p) => p.id) : [];
  };

  // Work saved in the course marks the deadline done: note the first time we see it.
  await stampDone(rows);

  const holders = new Map<string, string[]>();
  for (const r of rows) holders.set(r.id, await holdersOf(r));
  const allIds = Array.from(new Set([...rows.flatMap((r) => [r.setById, ...(holders.get(r.id) || [])])]));
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: allIds.length ? allIds : ["none"] } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  const withStatus = rows.map((r) => ({ r, s: statusOf(r), who: holders.get(r.id) || [] }));
  const mine = withStatus.filter((x) => x.who.includes(user.id) || (!x.r.courseId && !!x.r.role && myHats.includes(x.r.role) && x.r.assigneeId === null && x.r.setById !== user.id));
  const mineIds = new Set(mine.map((x) => x.r.id));
  const team = withStatus.filter((x) => !mineIds.has(x.r.id));
  // The same course task can carry several dates (the Institute Head's final date, then a Dean's earlier one). Show the earliest and note the final.
  const finalOf = new Map<string, Date>();
  const earliest = new Map<string, (typeof withStatus)[number]>();
  for (const x of mine) {
    if (!x.r.courseId && !x.r.assigneeId) continue;
    const key = x.r.courseId ? `${x.r.courseId}|${x.r.kind}` : `T|${x.r.assigneeId}|${x.r.title}`;
    const f = finalOf.get(key); if (!f || x.r.dueDate > f) finalOf.set(key, x.r.dueDate);
    const e = earliest.get(key); if (!e || x.r.dueDate < e.r.dueDate) earliest.set(key, x);
  }
  const keyOf = (r: DlRow) => (r.courseId ? `${r.courseId}|${r.kind}` : `T|${r.assigneeId}|${r.title}`);
  const mineShown = mine.filter((x) => (!x.r.courseId && !x.r.assigneeId) || earliest.get(keyOf(x.r)) === x);

  // "My work": every live course this person is Subject Expert or Instructor of, with where it stands and its next date.
  const seIds = myCourses.filter((c) => c.subjectExpertId === user.id).map((c) => c.id);
  const insIds = myCourses.filter((c) => c.instructorId === user.id).map((c) => c.id);
  const workInfo = await prisma.course.findMany({
    where: { id: { in: [...seIds, ...insIds].length ? [...seIds, ...insIds] : ["none"] } },
    select: { id: true, code: true, title: true, courseType: true, coordinatorId: true, templateStatus: true, seResponse: true, instructorResponse: true, batch: { select: { degreeProgram: true, batchName: true } }, coordinator: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  const [seProg, insProg] = await Promise.all([
    seProgressFor(workInfo.filter((c) => seIds.includes(c.id))),
    instructorProgressFor(insIds),
  ]);
  const nextFor = (courseId: string, roles: string[]) => {
    const open = mine.filter((x) => x.r.courseId === courseId && !x.r.completedAt && roles.includes(x.r.role || KIND_ROLE[x.r.kind] || "")).sort((a, b) => a.r.dueDate.getTime() - b.r.dueDate.getTime());
    return open[0] || null;
  };
  const workRows = [
    ...workInfo.filter((c) => seIds.includes(c.id)).map((c) => ({ c, as: "Subject Expert", steps: seProg.get(c.id) || [], next: nextFor(c.id, ["SUBJECT_EXPERT"]), href: `/subjectexpert/courses/${c.id}/clos`, pending: c.seResponse === "PENDING", status: c.templateStatus })),
    ...workInfo.filter((c) => insIds.includes(c.id)).map((c) => ({ c, as: "Instructor", steps: insProg.get(c.id) || [], next: nextFor(c.id, ["INSTRUCTOR"]), href: `/instructor/courses/${c.id}/schedule`, pending: c.instructorResponse === "PENDING", status: null as string | null })),
  ];
  const openMine = mineShown.filter((x) => !x.r.completedAt);
  const overdueN = openMine.filter((x) => x.s === "OVERDUE").length, soonN = openMine.filter((x) => x.s === "SOON").length;
  const STATUS_WORD: Record<string, string> = { draft: "Draft", submitted: "Submitted to OMC", approved: "Approved", "changes-requested": "Changes requested", reopened: "Reopened for changes" };

  // Gantt of my tasks, and which of my unfinished tasks are holding up the next person's work.
  const now = new Date();
  const blocking = await blockedByMe(chairmanId, user.id, mineShown.map((x) => x.r), now);
  const DAYMS = 86400000;
  const stripTerm = (t: string) => t.replace(/ \((Fall|Spring)[^)]*\)$/i, "");
  const ganttTasks: GanttTask[] = mineShown.slice().sort((a, b) => a.r.dueDate.getTime() - b.r.dueDate.getTime()).slice(0, 80).map(({ r, s: st }) => {
    const b = blocking.get(r.id);
    const others = b ? [...b.held.filter((h) => !h.mineToo), ...b.held.filter((h) => h.mineToo)] : [];
    const c = r.courseId ? courseOf.get(r.courseId) : null;
    return {
      id: r.id, label: stripTerm(r.title), sub: c ? `${c.code} ${c.title}` : r.planTerm || (names.get(r.setById) ? `set by ${names.get(r.setById)}` : ""),
      from: new Date(r.dueDate.getTime() - taskDays(r) * DAYMS), to: r.dueDate, status: st,
      blocking: b?.severity, waiting: others.slice(0, 3).map((h) => ({ label: h.course ? `${h.title} (${h.course})` : h.title, who: h.who, from: h.startDate, to: h.dueDate })),
      waitingMore: Math.max(0, others.length - 3),
    };
  });
  const blockList = mineShown.filter((x) => blocking.has(x.r.id)).map((x) => ({ x, b: blocking.get(x.r.id)! })).sort((a, b) => (a.b.severity === b.b.severity ? a.x.r.dueDate.getTime() - b.x.r.dueDate.getTime() : a.b.severity === "now" ? -1 : 1));

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
  const table = (list: typeof withStatus, showWho: boolean, finals?: Map<string, Date>) => (
    <table>
      <thead><tr><th>Due</th>{showWho && <th>Who</th>}<th>What</th><th>Course</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.map(({ r, s, who }) => (
        <tr key={r.id}>
          <td style={{ whiteSpace: "nowrap" }}>{day(r.dueDate)}</td>
          {showWho && <td>{whoCell(r, who)}</td>}
          <td><b>{r.title}</b>{r.kind !== "CUSTOM" && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{DEADLINE_KINDS[r.kind]}</div>}{r.description && <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.description}</div>}
            {!showWho && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>Set by {names.get(r.setById) || "—"}{(() => { const k = r.courseId ? `${r.courseId}|${r.kind}` : `T|${r.assigneeId}|${r.title}`; const f = finals?.get(k); return f && f.getTime() !== r.dueDate.getTime() ? ` · final date ${day(f)}` : ""; })()}</div>}</td>
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
      {isSetter && (
        <p style={{ marginBottom: 12 }}><a className="btn" href="/semester-plan">Semester plan: targets for every role, and who is behind</a></p>
      )}
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
      <div className="stat-grid">
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{workRows.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Courses assigned to me</div></div>
        <div className={`stat ${overdueN ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700, color: overdueN ? "#B3261E" : undefined }}>{overdueN}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>My deadlines overdue</div></div>
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{soonN}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Due in the next 3 days</div></div>
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{openMine.length - overdueN - soonN}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Later</div></div>
      </div>

      {blockList.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${blockList.some((b) => b.b.severity === "now") ? "#B3261E" : "#B7791F"}` }}>
          <h3 style={{ marginTop: 0, color: blockList.some((b) => b.b.severity === "now") ? "#B3261E" : "#95650F" }}>
            {blockList.some((b) => b.b.severity === "now") ? "Your delay is holding up other work" : "Due soon — other work is waiting on it"}
          </h3>
          <div style={{ display: "grid", gap: 10 }}>
            {blockList.map(({ x, b }) => {
              const c = x.r.courseId ? courseOf.get(x.r.courseId) : null;
              const lateDays = Math.floor((now.getTime() - (x.r.dueDate.getTime() + DAYMS - 1)) / DAYMS) + 1;
              const others = b.held.filter((h) => !h.mineToo);
              const own = b.held.filter((h) => h.mineToo);
              return (
                <div key={x.r.id} style={{ fontSize: 12.5 }}>
                  <b>{stripTerm(x.r.title)}</b>{c ? ` — ${c.code} ${c.title}` : ""}{" "}
                  {b.severity === "now" ? <span className="badge badge-no">{lateDays} day{lateDays === 1 ? "" : "s"} overdue</span> : <span className="badge badge-warn">due {day(x.r.dueDate)}</span>}
                  {others.length > 0 && (
                    <div style={{ marginTop: 3 }}>
                      <span style={{ color: "var(--slate)" }}>Waiting for it:</span>{" "}
                      {others.slice(0, 6).map((h, i) => (
                        <span key={h.id}>{i ? "; " : ""}<b>{h.who}</b> — {h.title}{h.course ? ` (${h.course})` : ""}, due {day(h.dueDate)}{h.startDate <= now ? <span style={{ color: "#B3261E" }}> (should have started)</span> : ""}</span>
                      ))}
                      {others.length > 6 && <span> and {others.length - 6} more</span>}
                    </div>
                  )}
                  {own.length > 0 && <div style={{ color: "var(--slate)", marginTop: 2 }}>Your own next steps waiting: {own.slice(0, 4).map((h) => h.title + (h.course ? ` (${h.course})` : "")).join("; ")}{own.length > 4 ? ` and ${own.length - 4} more` : ""}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ganttTasks.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>My tasks on a timeline</h3>
          <MyTasksGantt tasks={ganttTasks} now={now} />
        </div>
      )}

      {workRows.length > 0 && (
        <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>My courses — where I stand</h3>
          <table>
            <thead><tr><th>Course</th><th>As</th><th>Progress</th><th>Status</th><th>Next deadline</th><th></th></tr></thead>
            <tbody>{workRows.map((w) => (
              <tr key={w.c.id + w.as}>
                <td><b>{w.c.code}</b> {w.c.title}<div style={{ fontSize: 11.5, color: "var(--slate)" }}>{w.c.batch ? `${w.c.batch.degreeProgram} — ${w.c.batch.batchName}` : "—"} · assigned by {w.c.coordinator?.name || "—"}</div></td>
                <td>{w.as}</td>
                <td><ProgressBar steps={w.steps} showPending /></td>
                <td style={{ fontSize: 12.5 }}>
                  {w.pending ? <span className="badge badge-warn">Waiting for your answer</span> : w.status ? STATUS_WORD[w.status] || w.status : "—"}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {w.next ? <><div style={{ whiteSpace: "nowrap" }}>{day(w.next.r.dueDate)} {badge(w.next.s)}</div><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{w.next.r.title}</div></> : <span style={{ color: "var(--slate)" }}>No deadline set</span>}
                </td>
                <td><Link href={w.pending ? "/dashboard" : w.href} className="act act-primary">{w.pending ? "Answer" : "Open"}</Link></td>
              </tr>
            ))}</tbody>
          </table>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Progress is worked out from the course itself, so it moves as soon as you save the work. Courses of terms that are already over are not listed.</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>My deadlines</h3>
        {mineShown.length === 0 ? <p style={{ color: "var(--slate)" }}>Nothing is due from you.</p> : table(mineShown, false, finalOf)}
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
