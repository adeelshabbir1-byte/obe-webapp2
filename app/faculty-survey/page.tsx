import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { qdb, QUALITY_HINT, FACULTY_SURVEY, FACULTY_ITEMS, FACULTY_ROLES, MIN_FACULTY_ANSWERS, facultySummary, instituteOf } from "../../lib/quality";

export const dynamic = "force-dynamic";
const LEADERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];

// Faculty survey (HEC QEC Proforma 5): the Institute Head opens a round, teaching staff answer anonymously, leaders see averages.
export default async function FacultySurveyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const leader = LEADERS.includes(user.role), staff = FACULTY_ROLES.includes(user.role);
  if (!leader && !staff) redirect("/dashboard");
  const cid = await instituteOf(user);
  const rounds = ((await qdb.facultySurveyRound.findMany({ where: { chairmanId: cid || "none" }, orderBy: { createdAt: "desc" }, take: 6 }).catch(() => null)) as { id: string; title: string; status: string; createdAt: Date }[] | null);
  const intro = "The Faculty Survey (HEC QEC Proforma 5; NCEAC and PEC ask for it too): teaching staff rate workload, resources, development and environment from 1 (strongly disagree) to 5 (strongly agree). Answers are anonymous — only averages are shown, and a group is shown only when at least 3 people answered.";
  if (rounds === null) return <QualityShell user={user} title="Faculty Survey" intro={intro}><div className="err">{QUALITY_HINT}</div></QualityShell>;
  const open = rounds.find((r) => r.status === "OPEN");
  const mine = open && staff ? await qdb.facultySurveyAnswer.findUnique({ where: { roundId_userId: { roundId: open.id, userId: user.id } } }) : null;
  const latest = rounds[0];
  const answers = leader && latest ? ((await qdb.facultySurveyAnswer.findMany({ where: { roundId: latest.id }, select: { answersJson: true, departmentId: true, comment: true } })) as { answersJson: string; departmentId: string | null; comment: string | null }[]) : [];
  const sum = facultySummary(answers);
  const depts = leader ? await prisma.department.findMany({ where: { id: { in: Array.from(new Set(answers.map((a) => a.departmentId).filter((x): x is string => !!x))) } }, select: { id: true, name: true } }).catch(() => []) : [];
  const col = (v: number | null) => (v === null ? undefined : v < 3 ? "#B3261E" : v < 3.5 ? "#A35A00" : "#1F5E36");
  return (
    <QualityShell user={user} title="Faculty Survey" intro={intro}>
      {user.role === "CHAIRMAN" && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          {open ? <><span>Open: <b>{open.title}</b></span><ActionButton url="/api/quality" body={{ action: "fsClose" }} label="Close the survey" className="btn btn-secondary btn-sm" confirmText="Close the faculty survey?" /></>
            : <ActionForm url="/api/quality" fixed={{ action: "fsOpen" }} submit="Open and tell all faculty" fields={[{ name: "title", label: "Title", placeholder: `Faculty Survey ${new Date().getFullYear()}`, width: 260 }]} />}
        </div>
      )}
      {staff && open && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{open.title} {mine && <span className="small-note">— you have answered; you can change your answers until it closes</span>}</h3>
          <ActionForm url="/api/quality" fixed={{ action: "fsAnswer" }} submit={mine ? "Update my answers" : "Submit (anonymous)"} done="Thank you — your answers are saved."
            initial={mine ? Object.fromEntries(Object.entries(JSON.parse(mine.answersJson) as Record<string, number>).map(([k, v]) => [`q_${k}`, String(v)])) : {}}
            fields={[...FACULTY_SURVEY.flatMap((g) => g.items.map(([k, t]) => ({ name: `q_${k}`, label: `${g.group}: ${t}`, type: "select" as const, options: [["", "—"], ["5", "5 Strongly agree"], ["4", "4 Agree"], ["3", "3 Neutral"], ["2", "2 Disagree"], ["1", "1 Strongly disagree"]] as [string, string][], full: true }))), { name: "comment", label: "Anything else the institute should know (optional)", type: "textarea" as const, full: true }]} />
        </div>
      )}
      {staff && !open && !leader && <div className="card">No faculty survey is open right now.</div>}
      {leader && latest && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>{latest.title} — {sum.n} answer{sum.n === 1 ? "" : "s"} {latest.status === "OPEN" ? "(still open)" : ""}</h3>
          {sum.n < MIN_FACULTY_ANSWERS ? <p className="small-note">Results show once at least {MIN_FACULTY_ANSWERS} people have answered.</p> : (
            <>
              <table><thead><tr><th>Question</th><th>Institute</th>{depts.map((d) => <th key={d.id}>{d.name}</th>)}</tr></thead>
                <tbody>{FACULTY_ITEMS.map(([k, t]) => (
                  <tr key={k}><td>{t}</td><td style={{ color: col(sum.avg[k]), fontWeight: 700 }}>{sum.avg[k] ?? "—"}</td>
                    {depts.map((d) => { const xs = answers.filter((a) => a.departmentId === d.id); const s = facultySummary(xs); return <td key={d.id} style={{ color: col(s.avg[k]) }}>{xs.length >= MIN_FACULTY_ANSWERS ? s.avg[k] ?? "—" : "·"}</td>; })}</tr>
                ))}<tr><td><b>Overall</b></td><td style={{ color: col(sum.overall), fontWeight: 700 }}>{sum.overall}</td>{depts.map((d) => { const xs = answers.filter((a) => a.departmentId === d.id); return <td key={d.id}>{xs.length >= MIN_FACULTY_ANSWERS ? facultySummary(xs).overall : `· (${xs.length})`}</td>; })}</tr></tbody></table>
              {answers.some((a) => a.comment) && <><h4>Comments</h4><ul style={{ fontSize: 13 }}>{answers.filter((a) => a.comment).slice(0, 40).map((a, i) => <li key={i}>{a.comment}</li>)}</ul></>}
            </>
          )}
        </div>
      )}
      {leader && !latest && <div className="card">No faculty survey has been run yet.{user.role === "CHAIRMAN" ? " Open one above." : ""}</div>}
    </QualityShell>
  );
}
