import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import CoursePreferencesManager from "../../../components/CoursePreferencesManager";

export default async function CoursePreferencesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["SUBJECT_EXPERT", "INSTRUCTOR"].includes(user.role)) redirect("/dashboard");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Course Preferences</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Let the Course Assigner know which courses you'd like to teach.
      </p>
      <CoursePreferencesManager />
    </Shell>
  );
}
