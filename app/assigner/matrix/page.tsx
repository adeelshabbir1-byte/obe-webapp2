import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import AssignmentMatrix from "../../../components/AssignmentMatrix";
import PrimaryInstructorAssigner from "../../../components/PrimaryInstructorAssigner";

const NAV = [{ href: "/assigner/matrix", label: "Section Assignment Matrix" }];

export default async function AssignerMatrixPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "COURSE_ASSIGNER") redirect("/dashboard");

  return (
    <Shell roleLabel="Course Assigner" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Section Assignment Matrix</h1>
        <a href="/api/assigner/matrix/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Courses on the left, faculty as columns — enter how many sections each faculty member is teaching.
      </p>
      <PrimaryInstructorAssigner />
      <AssignmentMatrix />
    </Shell>
  );
}
