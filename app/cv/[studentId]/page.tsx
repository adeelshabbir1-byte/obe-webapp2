import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { externalByToken } from "../../../lib/fyp";
import { cvView, sameInstitute } from "../../../lib/studentCv";
import CvDocument from "../../../components/CvDocument";
import PrintButton from "../../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "CV", robots: { index: false, follow: false } };

// Printable CV: the student, staff of the same institute, or an external evaluator's link (approved and shared CVs only).
export default async function CvPage({ params, searchParams }: { params: { studentId: string }; searchParams: { t?: string } }) {
  const v = await cvView(params.studentId);
  if (!v) notFound();
  const shared = v.row?.status === "APPROVED" && v.row.published;
  let ok = false;
  const student = await getAuthenticatedStudent().catch(() => null);
  if (student?.id === v.student.id) ok = true;
  if (!ok) { const user = await getAuthenticatedUser().catch(() => null); if (user && (await sameInstitute(user, v.chairmanId))) ok = true; }
  if (!ok && searchParams.t && shared) { const ext = await externalByToken(searchParams.t).catch(() => null); if (ext && ext.chairmanId === v.chairmanId) ok = true; }
  if (!ok) notFound();
  return (
    <main style={{ background: "#EEE", minHeight: "100vh", padding: "10px 0" }}>
      <style>{"@media print { body { background: #fff } main { background: #fff !important; padding: 0 !important } .cv-page { margin: 0 !important; max-width: none !important } @page { size: A4; margin: 12mm } }"}</style>
      <div className="no-print" style={{ textAlign: "center", margin: 10 }}><PrintButton /></div>
      <CvDocument v={v} />
    </main>
  );
}
