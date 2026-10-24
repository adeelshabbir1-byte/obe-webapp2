import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, type Centre } from "../../../lib/consortium";
import { institutionOf, type Approvals } from "../../../lib/consortiumAgreements";
import { modeLabel, OFFER_ROLES, type Offering } from "../../../lib/consortiumOfferings";
import { type Application } from "../../../lib/consortiumApplications";
import { curriculaWhere } from "../../../lib/curriculumLibrary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium applications" };

const ST: Record<string, [string, string]> = { APPLIED: ["New", "#B26A00"], ACCEPTED: ["Enrolled", "#2E7D32"], DECLINED: ["Declined", "#C62828"], WITHDRAWN: ["Withdrawn", "#6B7177"] };

// Host side: students of other universities applying for our courses (admit, verify payment).
// Home side: our students taking courses elsewhere — does each course count toward their degree?
export default async function Applications({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const hats = [user.role, user.secondaryRole, user.tertiaryRole, ...((user as { extraRoles?: string[] }).extraRoles || [])];
  const isSE = hats.includes("SUBJECT_EXPERT");
  if (!OFFER_ROLES.includes(user.role) && !isSE && user.role !== "FINANCE_OFFICER") return shell(<div className="card">Not available for your role.</div>);
  const me = await institutionOf(user);
  const all = (await cdb.consortiumApplication.findMany({ where: { OR: [{ hostChairmanId: me }, { homeChairmanId: me }] }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => null)) as Application[] | null;
  if (!all) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const tab = searchParams.tab || (OFFER_ROLES.includes(user.role) || user.role === "FINANCE_OFFICER" ? "host" : "home");
  const hostRows = all.filter((a) => a.hostChairmanId === me), homeRows = all.filter((a) => a.homeChairmanId === me && a.wantsCredit);
  const offs = (await cdb.consortiumOffering.findMany({ where: { id: { in: all.map((a) => a.offeringId) } } })) as Offering[];
  const courses = await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId) } }, select: { id: true, code: true, title: true, creditHours: true, prerequisiteCourse: { select: { code: true, title: true } } } });
  const students = await prisma.student.findMany({ where: { id: { in: all.map((a) => a.studentId) } }, select: { id: true, name: true, rollNumber: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const heads = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.flatMap((a) => [a.hostChairmanId, a.homeChairmanId]))) } }, select: { id: true, instituteName: true, name: true } });
  const centres = (await cdb.examCentre.findMany({ where: { id: { in: all.map((a) => a.examCentreId).filter((x): x is string => !!x) } } })) as Centre[];
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  const off = (a: Application) => offs.find((o) => o.id === a.offeringId);
  const crs = (a: Application) => courses.find((c) => c.id === off(a)?.courseId);
  const stu = (a: Application) => students.find((s) => s.id === a.studentId);
  // Home courses an approved course can count as: the student's programme's curricula of ours.
  const curs = me ? await prisma.masterCurriculum.findMany({ where: { ...(await curriculaWhere(me)), status: "PUBLISHED" }, select: { id: true, title: true, version: true, courses: { select: { id: true, code: true, title: true, creditHours: true }, orderBy: { code: "asc" } } } }) : [];
  const optsFor = (prog?: string) => curs.filter((c) => !prog || c.title.toLowerCase() === prog.toLowerCase()).flatMap((c) => c.courses.map((x) => [x.id, `${x.code} ${x.title} (${x.creditHours} CH) — ${c.title} ${c.version}`] as [string, string]));
  const tabBtn = (k: string, l: string) => <Link href={`?tab=${k}`} className={tab === k ? "btn btn-sm" : "btn btn-secondary btn-sm"}>{l}</Link>;
  const pending = { host: hostRows.filter((a) => a.status === "APPLIED" || a.paymentStatus === "CLAIMED").length, home: homeRows.filter((a) => a.creditStatus === "PENDING").length };
  const apText = (ap: Approvals) => { const x = me ? ap[me] : undefined; return [x?.se ? `SE ${x.se.name} ${x.se.ok ? "✓" : "✗"}` : "SE —", x?.chair ? `Chairman ${x.chair.name} ${x.chair.ok ? "✓" : "✗"}` : "Chairman —"].join(" · "); };
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium">← Consortium</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Consortium students</h1>
    <div style={{ display: "flex", gap: 6, margin: "6px 0 10px" }}>{tabBtn("host", `Applying to our courses${pending.host ? ` (${pending.host})` : ""}`)}{tabBtn("home", `Our students elsewhere — credit${pending.home ? ` (${pending.home})` : ""}`)}</div>

    {tab === "host" && <div className="card">
      <p className="small-note" style={{ marginTop: 0 }}>Students of other member universities. Accepting enrols them in your course as visiting students (batch &quot;Visiting &lt;term&gt;&quot;): your teachers mark their attendance and marks as usual, and they sign in to your student portal with the roll number shown. Check the prerequisite against what the student tells you, or ask them for their transcript.</p>
      {!hostRows.length ? <p className="small-note">No applications yet.</p> : <table style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Course</th><th>Status</th><th>Fee</th><th></th></tr></thead><tbody>{hostRows.map((a) => { const s = stu(a), c = crs(a), o = off(a); const [l, col] = ST[a.status] || [a.status, "#555"]; return (
        <tr key={a.id}><td><b>{s?.name}</b><div className="small-note">{uni(a.homeChairmanId)} · {s?.batch.degreeProgram}, semester {s?.currentSemesterNumber}</div>{a.statement ? <div className="small-note">“{a.statement}”</div> : null}</td>
          <td><b>{c?.code}</b> {c?.title}<div className="small-note">{o?.term} · {o ? modeLabel(o.mode) : ""}{a.examCentreId ? ` · exam: ${centres.find((x) => x.id === a.examCentreId)?.name || "—"}` : ""}{c?.prerequisiteCourse ? ` · prerequisite ${c.prerequisiteCourse.code} ${c.prerequisiteCourse.title}` : ""}</div></td>
          <td style={{ color: col, fontWeight: 700 }}>{l}{a.hostLogin ? <div className="small-note" style={{ fontWeight: 400 }}>{a.hostLogin}</div> : null}</td>
          <td>{a.fee ? <>{a.currency} {a.fee.toLocaleString()}<div className="small-note">{a.paymentStatus === "CLAIMED" ? `paid? ref ${a.paymentRef}` : a.paymentStatus.toLowerCase()}</div></> : "—"}</td>
          <td style={{ whiteSpace: "nowrap" }}>{a.status === "APPLIED" && user.role !== "FINANCE_OFFICER" && <><ActionButton showMessage url="/api/consortium/applications" body={{ action: "decide", id: a.id, accept: true }} label="Accept & enrol" confirmText={`Enrol ${s?.name} in ${c?.code}?`} />{" "}<ActionButton showMessage url="/api/consortium/applications" body={{ action: "decide", id: a.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" askNote="Why? (the student sees this)" noteRequired /></>}
            {a.paymentStatus === "CLAIMED" && <><ActionButton showMessage url="/api/consortium/applications" body={{ action: "payment", id: a.id, ok: true }} label="Payment received" />{" "}<ActionButton showMessage url="/api/consortium/applications" body={{ action: "payment", id: a.id, ok: false }} label="Not received" className="btn btn-secondary btn-sm" /></>}</td></tr>); })}</tbody></table>}
    </div>}

    {tab === "home" && <div className="card">
      <p className="small-note" style={{ marginTop: 0 }}>Our students taking courses at other universities and asking for credit. A Subject Expert and the Chairman both decide. Once approved, the pairing becomes a standing equivalence (when both courses are on the same curriculum edition) and later students get it automatically.</p>
      {!homeRows.length ? <p className="small-note">No credit requests.</p> : <table style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Course elsewhere</th><th>Credit</th><th></th></tr></thead><tbody>{homeRows.map((a) => { const s = stu(a), c = crs(a), o = off(a); const ap = JSON.parse(a.creditApprovalsJson || "{}") as Approvals; const mineDone = me ? ap[me]?.[user.role === "CHAIRMAN" ? "chair" : "se"] : null; return (
        <tr key={a.id}><td><b>{s?.name}</b> <span className="small-note">{s?.rollNumber}</span><div className="small-note">{s?.batch.degreeProgram} · {s?.batch.batchName}</div></td>
          <td><b>{c?.code}</b> {c?.title} <span className="small-note">({c?.creditHours} CH)</span><div className="small-note">{uni(a.hostChairmanId)} · {o?.term} · {a.status.toLowerCase()}</div>{o ? <Link href={`/catalog/${o.id}`} className="small-note">CLOs and details</Link> : null}</td>
          <td>{a.creditStatus === "RECOGNISED" ? <b style={{ color: "#2E7D32" }}>already recognised</b> : a.creditStatus === "APPROVED" ? <b style={{ color: "#2E7D32" }}>approved</b> : a.creditStatus === "DECLINED" ? <b style={{ color: "#C62828" }}>does not count</b> : <b style={{ color: "#B26A00" }}>to decide</b>}<div className="small-note">{apText(ap)}</div></td>
          <td>{a.creditStatus === "PENDING" && (user.role === "CHAIRMAN" || isSE) && !mineDone && <>
            <ActionForm showMessage url="/api/consortium/applications" fixed={{ action: "credit", id: a.id, ok: true }} submit={`Counts — approve as ${user.role === "CHAIRMAN" ? "Chairman" : "Subject Expert"}`} collapsed openLabel="Counts as…" initial={{ asCourseId: a.creditAsCourseId || "" }} fields={[{ name: "asCourseId", label: "Our course it counts as", type: "select", width: 420, options: [["", "—"], ...optsFor(s?.batch.degreeProgram)] }]} />
            <ActionButton showMessage url="/api/consortium/applications" body={{ action: "credit", id: a.id, ok: false }} label="Does not count" className="btn btn-secondary btn-sm" askNote="Why? (the student sees this)" noteRequired /></>}</td></tr>); })}</tbody></table>}
    </div>}
  </>);
}
