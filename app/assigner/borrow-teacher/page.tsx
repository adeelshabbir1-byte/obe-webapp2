import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import BorrowTeacher from "../../../components/BorrowTeacher";

const NAV = [
  { href: "/assigner/matrix", label: "Section Assignment Matrix" },
  { href: "/assigner/course-short-names", label: "Course Short Names" },
  { href: "/assigner/borrow-teacher", label: "Faculty from Other Departments" },
];

export default async function BorrowTeacherPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "COURSE_ASSIGNER") redirect("/dashboard");
  return (
    <Shell roleLabel="Course Assigner" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty from Other Departments</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>For example a BBA course taught by a CS teacher, or a CS management course taught by a Management teacher.</p>
      <BorrowTeacher />
    </Shell>
  );
}
