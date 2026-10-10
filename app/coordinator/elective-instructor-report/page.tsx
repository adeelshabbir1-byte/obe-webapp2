import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import ElectiveInstructorReportManager from "../../../components/ElectiveInstructorReportManager";
import { navForRole } from "../../../components/reportNav";


export default async function ElectiveInstructorReportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Elective Instructor Report</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Who taught each specialization elective, by degree program and semester — the record NCEAC asks for
        when reviewing elective delivery.
      </p>
      <ElectiveInstructorReportManager />
    </Shell>
  );
}
