import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import TopicWorkspace from "../../../components/TopicWorkspace";
import { workspaceCourses, WORKSPACE_ROLES } from "../../../lib/facultyTopicWorkspace";

export default async function FacultyTopicWorkspacePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!WORKSPACE_ROLES.includes(user.role)) redirect("/dashboard");
  const courses = await workspaceCourses(user);
  const se = user.role === "SUBJECT_EXPERT";
  return (
    <Shell roleLabel={se ? "Subject Expert" : "Course Instructor"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Topic Workspace</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Open 2 or 3 of your {se ? "assigned courses (their lecture plans)" : "semester courses (your own delivery plan)"} side by side, then drag topics to reorder them or move them from one course to another.
      </p>
      {courses.length < 2
        ? <div className="card">You need at least two {se ? "assigned" : "semester"} courses to use the workspace.</div>
        : <div className="card"><TopicWorkspace courses={courses} mode="faculty" /></div>}
    </Shell>
  );
}
