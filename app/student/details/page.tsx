import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import DetailsForm from "../../../components/DetailsForm";
import { studentDetails } from "../../../lib/aas";
import { selfFields } from "../../../lib/aasFields";

export const dynamic = "force-dynamic";

// The student's own personal and academic details, as NCEAC's Student Directory needs them.
export default async function StudentDetailsPage() {
  const s = await getAuthenticatedStudent();
  if (!s) redirect("/student/login");
  const v = (await studentDetails([s.id])).get(s.id) || {};
  return (
    <StudentShell studentName={s.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Details</h1>
      <div className="card">
        <DetailsForm fields={selfFields("student")} values={{ nationality: "Pakistani", ...v }} endpoint="/api/student/details" note="Your institute sends these to NCEAC (the national computing accreditation council) for accreditation. Fill them exactly as on your CNIC and your SSC / HSSC certificates. Dates as dd/mm/yyyy, CNIC as xxxxx-xxxxxxx-x." />
      </div>
    </StudentShell>
  );
}
