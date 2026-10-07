import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import BorrowTeacher from "../../../components/BorrowTeacher";

export default async function LeadFacultyRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_LEAD") redirect("/dashboard");
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty from Other Departments</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Ask another department for a teacher for one of your program's courses.</p>
      <BorrowTeacher />
    </Shell>
  );
}
