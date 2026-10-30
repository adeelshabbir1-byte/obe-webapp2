import StudentPhotoUpload from "../../../components/StudentPhotoUpload";
import KeyButton from "../../../components/KeyButton";
import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import DetailsForm from "../../../components/DetailsForm";
import { studentDetails } from "../../../lib/aas";
import { selfFields, canonValues, maskedValues } from "../../../lib/aasFields";
import { portalLists } from "../../../lib/nceacPortal";
import { instituteOfBatch } from "../../../lib/moduleLocks";

export const dynamic = "force-dynamic";

// The student's own personal and academic details, as NCEAC's Student Directory needs them.
export default async function StudentDetailsPage() {
  const s = await getAuthenticatedStudent();
  if (!s) redirect("/student/login");
  const v = (await studentDetails([s.id])).get(s.id) || {};
  return (
    <StudentShell studentName={s.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Details</h1>
      <StudentPhotoUpload />
      <div className="card">
        <DetailsForm fields={selfFields("student", await portalLists(await instituteOfBatch(s.batchId).catch(() => null)))} values={maskedValues(canonValues("student", { nationality: "Pakistani", ...v }))} endpoint="/api/student/details" note="Your institute sends these to NCEAC (the national computing accreditation council) for accreditation. Fill them exactly as on your CNIC and your SSC / HSSC certificates. Dates as dd/mm/yyyy, CNIC as xxxxx-xxxxxxx-x." />
      </div>
    <div className="card" style={{ maxWidth: 900, margin: "12px auto" }}><b>For your parents</b><p className="small-note">A read-only link showing your attendance, marks so far, results and fees. It goes to the guardian number you saved; you can turn it off.</p><KeyButton url="/api/parent-link" body={{ action: "create" }} label="Make a parent link" /> <KeyButton url="/api/parent-link" body={{ action: "revoke" }} label="Turn off parent links" /></div>
      </StudentShell>
  );
}
