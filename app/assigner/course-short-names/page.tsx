import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import CourseShortNamesManager from "../../../components/CourseShortNamesManager";

const NAV = [
  { href: "/assigner/matrix", label: "Section Assignment Matrix" },
  { href: "/assigner/course-short-names", label: "Course Short Names" },
];

export default async function CourseShortNamesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "COURSE_ASSIGNER") redirect("/dashboard");

  return (
    <Shell roleLabel="Course Assigner" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Short Names</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Choose your own compact display names for the matrix, instead of the automatic first-letters abbreviation.
      </p>
      <CourseShortNamesManager />
    </Shell>
  );
}
