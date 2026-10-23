import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import PrintButton from "../../../../components/PrintButton";
import SignOffBlock from "../../../../components/SignOffBlock";
import { whoIs } from "../../../../lib/registers";
import { applyTitles } from "../../../../lib/titles";
import { statusLetterDoc } from "../../../../lib/signoffDocs";

export const dynamic = "force-dynamic";
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// The letter confirming an approved student status change (freeze, leaving, transfer …), signed off by the people who
// approved each stage, with a document number and QR code.
export default async function StatusLetter({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const doc = await statusLetterDoc(params.id, user.id);
  if (!doc || doc.r.chairmanId !== w.chairmanId) notFound();
  const { r, approvals, student, titles, t, issued } = doc;
  const allowed = w.head || w.exam || w.dean || w.hod || r.raisedById === user.id || approvals.some((a) => a.byId === user.id) || student.batch.coordinatorId === user.id;
  if (!allowed) notFound();
  const inst = await prisma.user.findUnique({ where: { id: w.chairmanId }, select: { instituteName: true } });
  return (
    <div style={{ maxWidth: 820, margin: "24px auto", padding: "36px 40px", background: "#fff", color: "#1d1d1d", fontFamily: "Georgia, serif", boxShadow: "0 1px 4px rgba(0,0,0,.1)" }}>
      <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700 }}>{inst?.instituteName || ""}</div>
      <div style={{ textAlign: "center", fontSize: 13, marginBottom: 22 }}>Office of the {applyTitles("Controller of Examinations", titles)}</div>
      <p style={{ textAlign: "right", fontSize: 14 }}>{day(issued?.issuedAt || new Date())}</p>
      <p style={{ fontSize: 15 }}><b>Subject: {t.label} — {student.name} ({student.rollNumber})</b></p>
      <p style={{ fontSize: 15, lineHeight: 1.7 }}>
        This is to confirm that the request for <b>{t.label.toLowerCase()}</b> of <b>{student.name}</b>, roll number <b>{student.rollNumber}</b>, student of <b>{student.batch.degreeProgram}</b> ({student.batch.batchName}), has been approved with effect from <b>{day(r.effectiveDate)}</b>.
        {r.freezeSemesters ? ` The studies are frozen for ${r.freezeSemesters} semester(s); the student will continue with the next batch on the same curriculum.` : ""}
        {r.otherInstitute ? ` The student is moving to ${r.otherInstitute}.` : ""}
      </p>
      {t.what && <p style={{ fontSize: 14, lineHeight: 1.6, color: "#333" }}>{t.what}</p>}
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>Reason recorded: {r.reason}</p>
      <SignOffBlock issued={issued} />
      <div style={{ marginTop: 18 }} className="no-print"><PrintButton /></div>
    </div>
  );
}
