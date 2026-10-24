import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionButton } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT } from "../../../lib/consortium";
import { agreementsFor, institutionOf, type Approvals } from "../../../lib/consortiumAgreements";
import type { Graduation, PlanCheck } from "../../../lib/consortiumJoint";

export const dynamic = "force-dynamic";
export const metadata = { title: "Joint degree graduation" };

// Joint programmes: the students of linked batches, their degree audit, each university's approval, the record.
export default async function GraduationPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const me = await institutionOf(user);
  if (!me) return shell(<div className="card">Your account is not part of an institute.</div>);
  const ags = (await agreementsFor(me).catch(() => null))?.filter((a) => a.kind === "JOINT_DEGREE" && a.launchedAt);
  if (!ags) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const links = (await cdb.consortiumJointBatch.findMany({ where: { agreementId: { in: ags.map((a) => a.id) } } })) as { batchId: string; agreementId: string }[];
  const students = await prisma.student.findMany({ where: { batchId: { in: links.map((l) => l.batchId) }, status: { in: ["ACTIVE", "GRADUATED"] } }, select: { id: true, name: true, rollNumber: true, status: true, currentSemesterNumber: true, batchId: true, batch: { select: { batchName: true } } }, orderBy: [{ batchId: "asc" }, { rollNumber: "asc" }] });
  const grads = (await cdb.consortiumGraduation.findMany({ where: { studentId: { in: students.map((s) => s.id) } } })) as Graduation[];
  const heads = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(ags.flatMap((a) => a.parties.map((p) => p.chairmanId)))) } }, select: { id: true, instituteName: true, name: true } });
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium/agreements">← Agreements</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Joint degree students and graduation</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>The lead university runs each student&apos;s degree audit from the transcript (results brought in from partners included). When it passes, every university&apos;s Chairman approves, and the lead issues the jointly awarded degree record — printable for degree issuance and HEC attestation.</p>
    {!ags.length && <div className="card small-note">No launched joint programme.</div>}
    {ags.map((a) => { const lead = a.parties.find((p) => p.role === "LEAD")!; const isLead = me === lead.chairmanId; const ss = students.filter((s) => links.some((l) => l.batchId === s.batchId && l.agreementId === a.id)); return (
      <div key={a.id} className="card"><h3 style={{ marginTop: 0 }}>{a.title} <span className="small-note">{a.parties.map((p) => uni(p.chairmanId)).join(" + ")}</span></h3>
        {!ss.length ? <p className="small-note">No students yet — the lead links its batches on the agreement page.</p> :
        <table style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Degree audit</th><th>Approvals</th><th></th></tr></thead><tbody>{ss.map((s) => { const g = grads.find((x) => x.studentId === s.id && x.agreementId === a.id); const au = g ? (JSON.parse(g.auditJson || "{}") as { checks?: PlanCheck[]; cgpa?: number; earned?: number }) : null; const ap = g ? (JSON.parse(g.approvalsJson || "{}") as Approvals) : {}; return (
          <tr key={s.id}><td><b>{s.name}</b> <span className="small-note">{s.rollNumber}</span><div className="small-note">{s.batch.batchName} · semester {s.currentSemesterNumber}</div></td>
            <td>{!au ? <span className="small-note">not run</span> : <>{au.checks?.every((c) => c.ok) ? <b style={{ color: "#2E7D32" }}>passed</b> : <b style={{ color: "#B26A00" }}>not yet</b>} <span className="small-note">{au.earned} CH · CGPA {au.cgpa?.toFixed(2)}</span>{au.checks?.filter((c) => !c.ok).map((c) => <div key={c.rule} className="small-note" style={{ color: "#B26A00" }}>{c.rule}: {c.why}</div>)}</>}</td>
            <td className="small-note">{g ? a.parties.map((p) => `${uni(p.chairmanId)} ${ap[p.chairmanId]?.chair?.ok ? "✓" : "—"}`).join(" · ") : "—"}{g?.serial ? <div><Link href={`/consortium/graduation/${g.id}`}><b>{g.serial}</b></Link></div> : null}</td>
            <td style={{ whiteSpace: "nowrap" }}>{isLead && g?.status !== "ISSUED" && <ActionButton showMessage url="/api/consortium/joint" body={{ action: "audit", studentId: s.id }} label={g ? "Re-run audit" : "Run degree audit"} className="btn btn-secondary btn-sm" />}{" "}
              {g && g.status === "AUDITED" && user.role === "CHAIRMAN" && au?.checks?.every((c) => c.ok) && !ap[me]?.chair && <ActionButton showMessage url="/api/consortium/joint" body={{ action: "approve", id: g.id }} label="Approve" confirmText={`Approve the joint degree for ${s.name}?`} />}{" "}
              {g?.status === "APPROVED" && isLead && user.role === "CHAIRMAN" && <ActionButton showMessage url="/api/consortium/joint" body={{ action: "issue", id: g.id }} label="Issue degree record" confirmText="Issue the jointly awarded degree record? The student is marked graduated." />}
              {g?.status === "ISSUED" && <Link href={`/consortium/graduation/${g.id}`} className="btn btn-secondary btn-sm">Record</Link>}</td></tr>); })}</tbody></table>}
      </div>); })}
  </>);
}
