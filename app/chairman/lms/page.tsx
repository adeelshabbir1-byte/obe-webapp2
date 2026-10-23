import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { lmsConfig } from "../../../lib/moodle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moodle link" };

export default async function LmsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/home");
  const c = await lmsConfig(user.id);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Moodle link</h1>
      <div className="card">
        <p className="small-note" style={{ marginTop: 0 }}>Link your Moodle so teachers can pull grades straight into OBEHUB (Course → Marks → Import from Moodle). In Moodle: Site administration → Server → Web services — enable web services and REST, create a service with <code>core_enrol_get_enrolled_users</code> and <code>gradereport_user_get_grade_items</code>, and a token for a user who can see all courses. Students are matched by Moodle&apos;s ID number (set it to the roll number), username or email. Google Classroom and Canvas: teachers upload the CSV export instead.</p>
        <ActionForm url="/api/lms/moodle" fixed={{}} submit="Save" initial={{ url: c?.moodleUrl || "", token: "" }}
          fields={[{ name: "url", label: "Moodle address (https://lms.your-university.edu.pk)", width: 360 }, { name: "token", label: c?.moodleToken ? "Web-service token (saved — leave empty to keep)" : "Web-service token", width: 320 }]} />
      </div>
    </Shell>
  );
}
