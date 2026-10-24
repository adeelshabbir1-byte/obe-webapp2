import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { cdb } from "../../../../lib/consortium";
import { loadAgreement, institutionOf, type Approvals } from "../../../../lib/consortiumAgreements";
import type { Graduation } from "../../../../lib/consortiumJoint";

export const dynamic = "force-dynamic";
export const metadata = { title: "Joint degree record" };

// The jointly awarded degree record (print to PDF from the browser): both universities, the programme, the result,
// each university's approval, and the record's serial — for degree issuance and HEC attestation.
export default async function GradRecord({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const g = (await cdb.consortiumGraduation.findUnique({ where: { id: params.id } }).catch(() => null)) as Graduation | null;
  if (!g || g.status !== "ISSUED") notFound();
  const a = await loadAgreement(g.agreementId);
  const me = await institutionOf(user);
  if (!a || (user.role !== "SUPER_USER" && !a.parties.some((p) => p.chairmanId === me))) notFound();
  const st = await prisma.student.findUnique({ where: { id: g.studentId }, select: { name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const heads = await prisma.user.findMany({ where: { id: { in: a.parties.map((p) => p.chairmanId) } }, select: { id: true, instituteName: true, name: true, instituteLogo: true } });
  const au = JSON.parse(g.auditJson || "{}") as { earned?: number; cgpa?: number; atLead?: number };
  const ap = JSON.parse(g.approvalsJson || "{}") as Approvals;
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId: g.studentId, creditHours: { gt: 0 } }, orderBy: [{ termYear: "asc" }, { termName: "asc" }, { courseCode: "asc" }] });
  const H = (id: string) => heads.find((h) => h.id === id);
  return (
    <main style={{ maxWidth: 820, margin: "24px auto", padding: "28px 32px", background: "#fff", color: "#111", fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", gap: 20, marginBottom: 14 }}>{a.parties.map((p) => <div key={p.chairmanId} style={{ textAlign: "center" }}>{H(p.chairmanId)?.instituteLogo ? <img src={H(p.chairmanId)!.instituteLogo!} alt="" style={{ height: 64 }} /> : null}<div style={{ fontWeight: 700 }}>{H(p.chairmanId)?.instituteName || H(p.chairmanId)?.name}</div></div>)}</div>
      <h1 style={{ textAlign: "center", fontSize: 24, margin: "6px 0" }}>Joint Degree Record</h1>
      <p style={{ textAlign: "center", margin: "4px 0 18px" }}>This is to record that <b>{st?.name}</b> ({st?.rollNumber}) has completed the joint programme <b>{a.title}</b>{a.programme && a.programme !== a.title ? ` (${a.programme})` : ""}, jointly offered and awarded by {a.parties.map((p) => H(p.chairmanId)?.instituteName || H(p.chairmanId)?.name).join(" and ")}.</p>
      <table style={{ width: "100%", fontSize: 14, marginBottom: 14 }}><tbody>
        <tr><td>Credit hours earned</td><td><b>{au.earned}</b></td><td>CGPA</td><td><b>{au.cgpa?.toFixed(2)}</b></td></tr>
        <tr><td>Record no.</td><td><b>{g.serial}</b></td><td>Issued</td><td><b>{g.issuedAt?.toISOString().slice(0, 10)}</b></td></tr>
        <tr><td>Curriculum edition</td><td>{a.edition}</td><td>Batch</td><td>{st?.batch.batchName}</td></tr>
      </tbody></table>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: "1px solid #999" }}><th align="left">Term</th><th align="left">Course</th><th>CH</th><th>Grade</th></tr></thead>
        <tbody>{recs.map((r) => <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}><td>{r.termName} {r.termYear}</td><td>{r.courseCode} {r.courseTitle}</td><td align="center">{r.creditHours}</td><td align="center">{r.grade}</td></tr>)}</tbody></table>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 34, gap: 20 }}>{a.parties.map((p) => <div key={p.chairmanId} style={{ textAlign: "center", fontSize: 13 }}><div style={{ borderTop: "1px solid #333", paddingTop: 4, minWidth: 220 }}>{ap[p.chairmanId]?.chair?.name || "—"}</div><div>for {H(p.chairmanId)?.instituteName || H(p.chairmanId)?.name}</div><div style={{ fontSize: 11, color: "#555" }}>approved {ap[p.chairmanId]?.chair?.at?.slice(0, 10) || ""}</div></div>)}</div>
      <p style={{ fontSize: 11, color: "#555", marginTop: 24, textAlign: "center" }}>Issued under a joint degree agreement in accordance with the HEC Policy on Dual, Double and Joint Degree Programmes. Produced by OBEHUB; the degree is awarded by the universities named above. Verify with record no. {g.serial}.</p>
    </main>
  );
}
