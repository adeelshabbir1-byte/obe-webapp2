import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import EmployeeUpload from "../../../components/EmployeeUpload";
import { UPLOAD_ROLES } from "../../../lib/employeeImport";

export const dynamic = "force-dynamic";

export default async function EmployeesUploadPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!UPLOAD_ROLES.includes(user.role)) redirect("/dashboard");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Upload Employees</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Add all faculty and staff from one Excel file. {user.role === "CHAIRMAN" ? "Any department of the institute." : "Your own department only."} Only four columns are required;
        the rest each person completes in their Profile. Roles are given afterwards in the Hierarchy view.
      </p>
      <EmployeeUpload />
    </Shell>
  );
}
