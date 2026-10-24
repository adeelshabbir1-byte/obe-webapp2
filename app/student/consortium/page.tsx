import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { prisma } from "../../../lib/db";
import { cdb, CONSORTIUM_HINT, isActiveMember, type Centre } from "../../../lib/consortium";
import { catalog, modeLabel, type Offering } from "../../../lib/consortiumOfferings";
import { recognisedAt } from "../../../lib/consortiumAgreements";
import { homeOfStudent, type Application } from "../../../lib/consortiumApplications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium courses" };

const ST: Record<string, [string, string]> = { APPLIED: ["Waiting for the host", "#B26A00"], ACCEPTED: ["Enrolled", "#2E7D32"], DECLINED: ["Not accepted", "#C62828"], WITHDRAWN: ["Withdrawn", "#6B7177"] };
const CR: Record<string, [string, string]> = { RECOGNISED: ["Counts toward your degree", "#2E7D32"], APPROVED: ["Counts toward your degree", "#2E7D32"], PENDING: ["Your university is deciding", "#B26A00"], DECLINED: ["Does not count", "#C62828"], NOT_REQUESTED: ["Not for credit", "#6B7177"] };

// Student: take a course at another member university — browse, apply, see the decision, pay the host, sign in there.
export default async function StudentConsortium() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const shell = (x: React.ReactNode) => <StudentShell studentName={st.name}>{x}</StudentShell>;
  const home = await homeOfStudent(st.id);
  const member = home ? await isActiveMember(home).catch(() => null) : false;
  if (member === null) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (!member) return shell(<><h1 style={{ fontSize: 22 }}>Consortium courses</h1><div className="card">Your university is not part of the OBEHUB consortium yet. You can still browse the <Link href="/catalog">public catalog</Link>.</div></>);
  const apps = (await cdb.consortiumApplication.findMany({ where: { studentId: st.id }, orderBy: { createdAt: "desc" } })) as Application[];
  const offs = (await cdb.consortiumOffering.findMany({ where: { id: { in: apps.map((a) => a.offeringId) } } })) as Offering[];
  const courses = await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId) } }, select: { id: true, code: true, title: true, creditHours: true } });
  const heads = await prisma.user.findMany({ where: { id: { in: apps.map((a) => a.hostChairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const centres = (await cdb.examCentre.findMany({ where: { id: { in: apps.map((a) => a.examCentreId).filter((x): x is string => !!x) } } })) as Centre[];
  const homeCourses = await prisma.masterCourse.findMany({ where: { id: { in: apps.map((a) => a.creditAsCourseId).filter((x): x is string => !!x) } }, select: { id: true, code: true, title: true } });
  // Show a host sign-in once, then forget it.
  const reveal = apps.filter((a) => a.tempSecret);
  if (reveal.length) await cdb.consortiumApplication.updateMany({ where: { id: { in: reveal.map((a) => a.id) } }, data: { tempSecret: null } });
  const open = (await catalog()).filter((r) => r.chairmanId !== home && !apps.some((a) => a.offeringId === r.id && a.status !== "WITHDRAWN"));
  const counts = new Map<string, boolean>();
  for (const r of open) counts.set(r.id, !!r.course.masterCourseId && (await recognisedAt(home!, r.course.masterCourseId)).length > 0);
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Consortium courses</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Take a course at another member university — on its campus or online. The host decides on admission and you pay its fee; your own university decides whether the course counts toward your degree. The final exam is proctored at the centre you choose. <Link href="/catalog">Full catalog</Link></p>

    {reveal.map((a) => <div key={a.id} className="card" style={{ borderLeft: "4px solid #2E7D32" }}><b>Your sign-in at {uni(a.hostChairmanId)}</b> — shown only once, write it down: roll number <b style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{a.hostLogin}</b>, first password <b style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{a.tempSecret}</b>. Sign out and sign in with these to see the course, attendance and marks there; you will choose your own password. Lost it? Ask the host&apos;s Program Coordinator to reset it.</div>)}

    {apps.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>My consortium courses</h3>
      <table style={{ fontSize: 13 }}><thead><tr><th>Course</th><th>Status</th><th>Counts at my university?</th><th>Fee</th><th></th></tr></thead><tbody>{apps.map((a) => {
        const o = offs.find((x) => x.id === a.offeringId), c = courses.find((x) => x.id === o?.courseId); const [l, col] = ST[a.status] || [a.status, "#555"]; const [cl, cc] = CR[a.creditStatus] || [a.creditStatus, "#555"]; const hc = homeCourses.find((x) => x.id === a.creditAsCourseId);
        return (<tr key={a.id}><td><b>{c?.code}</b> {c?.title}<div className="small-note">{uni(a.hostChairmanId)} · {o?.term} · {o ? modeLabel(o.mode) : ""}{a.examCentreId ? ` · exam at ${centres.find((x) => x.id === a.examCentreId)?.name || "—"}` : ""}</div></td>
          <td style={{ color: col, fontWeight: 700 }}>{l}{a.hostNote ? <div className="small-note" style={{ fontWeight: 400 }}>{a.hostNote}</div> : null}{a.status === "ACCEPTED" && a.hostLogin ? <div className="small-note" style={{ fontWeight: 400 }}>Host roll number {a.hostLogin}</div> : null}</td>
          <td style={{ color: cc }}>{cl}{hc && (a.creditStatus === "APPROVED" || a.creditStatus === "RECOGNISED") ? <div className="small-note">as {hc.code} {hc.title}</div> : null}{a.creditNote && a.creditStatus === "DECLINED" ? <div className="small-note">{a.creditNote}</div> : null}</td>
          <td>{a.fee ? <>{a.currency} {a.fee.toLocaleString()}<div className="small-note" style={{ color: a.paymentStatus === "VERIFIED" ? "#2E7D32" : a.paymentStatus === "CLAIMED" ? "#B26A00" : "#C62828" }}>{a.paymentStatus === "VERIFIED" ? "paid" : a.paymentStatus === "CLAIMED" ? `being verified (${a.paymentRef})` : "unpaid"}</div></> : "none"}</td>
          <td style={{ whiteSpace: "nowrap" }}>{a.fee > 0 && a.status === "ACCEPTED" && a.paymentStatus === "UNPAID" && <ActionForm url="/api/student/consortium" fixed={{ action: "pay", id: a.id }} submit="Send" collapsed openLabel="I have paid" fields={[{ name: "ref", label: "Transaction / receipt no." }]} />}
            {(a.status === "APPLIED" || a.status === "ACCEPTED") && <ActionButton url="/api/student/consortium" body={{ action: "withdraw", id: a.id }} label="Withdraw" className="btn btn-secondary btn-sm" confirmText="Withdraw from this course?" />}</td></tr>);
      })}</tbody></table></div>}

    <div className="card"><h3 style={{ marginTop: 0 }}>Open courses</h3>
      {!open.length ? <p className="small-note">No courses open right now.</p> : <div style={{ display: "grid", gap: 10 }}>{open.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line, #E1E5EA)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div><Link href={`/catalog/${r.id}`}><b>{r.course.code} {r.course.title}</b></Link><div className="small-note">{r.university} · {r.term} · {modeLabel(r.mode)} · {r.course.creditHours}{r.lab ? ` (${r.course.creditHours - r.lab}+${r.lab})` : ""} CH · {r.feePerCredit ? `${r.currency} ${(r.feePerCredit * r.course.creditHours).toLocaleString()}` : "no fee"} · {r.seatsLeft} seat(s) left</div></div>
            <b style={{ color: counts.get(r.id) ? "#2E7D32" : "#B26A00", fontSize: 12.5 }}>{counts.get(r.id) ? "Counts at your university" : "Not yet recognised by your university"}</b>
          </div>
          {r.open && r.seatsLeft > 0 ? <ActionForm url="/api/student/consortium" fixed={{ action: "apply", offeringId: r.id }} submit="Apply" collapsed openLabel="Apply…" initial={{ wantsCredit: true, examCentreId: r.centres[0]?.id || "" }}
            fields={[...(r.centres.length ? [{ name: "examCentreId", label: "Final exam at", type: "select" as const, width: 280, options: r.centres.map((c) => [c.id, `${c.name}${c.city ? `, ${c.city}` : ""}`] as [string, string]) }] : []),
              ...(counts.get(r.id) ? [] : [{ name: "wantsCredit", label: "Ask my university to count it toward my degree", type: "checkbox" as const }]), { name: "statement", label: "Why you want this course (optional)", type: "textarea" as const }]} />
            : <span className="small-note">{r.seatsLeft ? "Applications closed." : "Full."}</span>}
        </div>))}</div>}
    </div>
  </>);
}
