import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { eligibleCourses } from "../../lib/publicCourse";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import PublicCourseLibrary from "../../components/PublicCourseLibrary";

const ROLE_LABEL: Record<string, string> = { SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Course Instructor", PROGRAM_COORDINATOR: "Program Coordinator", OMC: "OMC", CHAIRMAN: "Chairman", SUPER_USER: "Super User" };

export default async function PublicLibraryPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLE_LABEL[user.role]) redirect("/dashboard");

  const myCourses = await eligibleCourses(user);
  const nav = user.role === "SUPER_USER"
    ? [{ href: "/admin/users", label: "Manage Chairmen" }, { href: "/public-library", label: "Public Course Library" }]
    : navForRole(user.role);

  return (
    <Shell roleLabel={ROLE_LABEL[user.role]} userName={user.name} navLinks={nav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Public Course Library</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Courses that teachers and Subject Experts from any institute (or from industry) have chosen to share. Search for one and import it into
        a course of your own — you get an independent copy you can edit freely; the original is never changed.
      </p>
      <PublicCourseLibrary role={user.role} myCourses={myCourses} />
    </Shell>
  );
}
