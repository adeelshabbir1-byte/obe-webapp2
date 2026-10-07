import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import BorrowTeacher from "../../../components/BorrowTeacher";

export default async function OmcFacultyRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");
  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Teachers from Other Departments</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Ask another department for a Subject Expert for one of your courses. Their head allows some people, you pick one, and that person accepts or declines.
      </p>
      <BorrowTeacher />
    </Shell>
  );
}
