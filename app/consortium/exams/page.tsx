import { redirect } from "next/navigation";
import Sources from "../../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, rulesOn, type Centre } from "../../../lib/consortium";
import { institutionOf } from "../../../lib/consortiumAgreements";
import type { Offering } from "../../../lib/consortiumOfferings";
import type { Application } from "../../../lib/consortiumApplications";
import type { Booking } from "../../../lib/consortiumExams";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium exams" };

// The centre's university: who sits a consortium exam at our centres, and recording each sitting.
// The host: where its visiting students sit, and whether they attended.
export default async function Exams({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const me = await institutionOf(user);
  const myCentres = (await cdb.examCentre.findMany({ where: { chairmanId: me } }).catch(() => null)) as Centre[] | null;
  if (!myCentres) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const { rules } = await rulesOn();
  const tab = searchParams.tab || "centre";
  const hostApps = (await cdb.consortiumApplication.findMany({ where: { hostChairmanId: me, status: "ACCEPTED" } })) as Application[];
  const atMine = (await cdb.consortiumExamBooking.findMany({ where: { centreId: { in: myCentres.map((c) => c.id) } }, orderBy: [{ examOn: "asc" }, { seatNo: "asc" }] })) as Booking[];
  const hostBookings = (await cdb.consortiumExamBooking.findMany({ where: { applicationId: { in: hostApps.map((a) => a.id) } } })) as Booking[];
  const appIds = Array.from(new Set([...atMine.map((b) => b.applicationId), ...hostApps.map((a) => a.id)]));
  const apps = (await cdb.consortiumApplication.findMany({ where: { id: { in: appIds } } })) as Application[];
  const offs = (await cdb.consortiumOffering.findMany({ where: { id: { in: apps.map((a) => a.offeringId) } } })) as Offering[];
  const courses = await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId) } }, select: { id: true, code: true, title: true } });
  const students = await prisma.student.findMany({ where: { id: { in: apps.map((a) => a.studentId) } }, select: { id: true, name: true, rollNumber: true } });
  const allCentres = (await cdb.examCentre.findMany({ where: { id: { in: [...atMine, ...hostBookings].map((b) => b.centreId) } } })) as Centre[];
  const heads = await prisma.user.findMany({ where: { id: { in: Array.from(new Set([...apps.flatMap((a) => [a.homeChairmanId, a.hostChairmanId]), ...allCentres.map((c) => c.chairmanId)])) } }, select: { id: true, instituteName: true, name: true } });
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  const A = (id: string) => apps.find((a) => a.id === id), O = (a?: Application) => offs.find((o) => o.id === a?.offeringId), C = (o?: Offering) => courses.find((c) => c.id === o?.courseId), S = (a?: Application) => students.find((s) => s.id === a?.studentId);
  const tabBtn = (k: string, l: string) => <Link href={`?tab=${k}`} className={tab === k ? "btn btn-sm" : "btn btn-secondary btn-sm"}>{l}</Link>;
  const stCol = (s: string) => (s === "PRESENT" ? "#2E7D32" : s === "ABSENT" ? "#C62828" : "#B26A00");
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium">← Consortium</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Consortium exams</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Final exams of consortium courses are proctored at a centre both the host and the student&apos;s own university approve. The centre&apos;s university invigilates and records each sitting: identification (biometric or ID card), the invigilator, and the CCTV recording reference (kept {String(rules.recordingYears)} years). <Sources targets={["page:exams", "rule:examProctored", "rule:recordingYears", "rule:centreBothApprove"]} /></p>
    <div style={{ display: "flex", gap: 6, margin: "6px 0 10px" }}>{tabBtn("centre", `At our centres (${atMine.length})`)}{tabBtn("host", `Our visiting students (${hostApps.length})`)}</div>
    {tab === "centre" && <div className="card">{!atMine.length ? <p className="small-note">No one is booked at your centres.</p> :
      <table style={{ fontSize: 13 }}><thead><tr><th>Date · seat</th><th>Student</th><th>Course (host)</th><th>Status</th><th></th></tr></thead><tbody>{atMine.map((b) => { const a = A(b.applicationId), o = O(a), c = C(o), s = S(a); return (
        <tr key={b.applicationId}><td>{b.examOn ? b.examOn.toISOString().slice(0, 10) : "date TBA"}<div className="small-note">{allCentres.find((x) => x.id === b.centreId)?.name} · {b.seatNo}</div></td>
          <td><b>{s?.name}</b><div className="small-note">{a ? uni(a.homeChairmanId) : ""} · {s?.rollNumber}</div></td><td>{c?.code} {c?.title}<div className="small-note">{a ? uni(a.hostChairmanId) : ""}</div></td>
          <td style={{ color: stCol(b.status), fontWeight: 700 }}>{b.status.toLowerCase()}{b.status === "PRESENT" ? <div className="small-note" style={{ fontWeight: 400 }}>{b.method === "BIOMETRIC" ? "biometric" : "ID card"} · {b.invigilator}{b.recordingRef ? ` · ${b.recordingRef}` : ""}</div> : null}</td>
          <td>{b.status === "BOOKED" && <><ActionForm showMessage url="/api/consortium/exams" fixed={{ action: "mark", id: b.applicationId, present: true }} submit="Record present" collapsed openLabel="Present…" initial={{ method: "BIOMETRIC", invigilator: user.name }}
            fields={[{ name: "method", label: "Identified by", type: "select", options: [["BIOMETRIC", "Biometric"], ["ID_CARD", "ID card"]] }, { name: "invigilator", label: "Invigilator" }, { name: "recordingRef", label: "CCTV recording reference", width: 200 }]} />
            <ActionButton showMessage url="/api/consortium/exams" body={{ action: "mark", id: b.applicationId, present: false }} label="Absent" className="btn btn-secondary btn-sm" confirmText="Record this student absent?" /></>}</td></tr>); })}</tbody></table>}</div>}
    {tab === "host" && <div className="card">{!hostApps.length ? <p className="small-note">No visiting students.</p> :
      <table style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Course</th><th>Exam</th><th>Fee</th></tr></thead><tbody>{hostApps.map((a) => { const b = hostBookings.find((x) => x.applicationId === a.id), c = C(O(a)), s = S(a), ce = b ? allCentres.find((x) => x.id === b.centreId) : null; return (
        <tr key={a.id}><td><b>{s?.name}</b><div className="small-note">{uni(a.homeChairmanId)} · here {a.hostLogin}</div></td><td>{c?.code} {c?.title}</td>
          <td>{b ? <><span style={{ color: stCol(b.status), fontWeight: 700 }}>{b.status.toLowerCase()}</span><div className="small-note">{ce?.name}{ce && ce.chairmanId !== me ? ` (${uni(ce.chairmanId)})` : ""} · {b.examOn ? b.examOn.toISOString().slice(0, 10) : "date TBA"} · {b.seatNo}</div></> : <span style={{ color: "#C62828" }}>no seat yet</span>}</td>
          <td className="small-note">{a.fee ? a.paymentStatus.toLowerCase() : "—"}</td></tr>); })}</tbody></table>}
      <p className="small-note">The exam date is the course&apos;s final-exam start date (set it on the course). A student without a verified payment does not get an admit slip.</p></div>}
  </>);
}
