import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FacultyProfileForm from "../../../components/FacultyProfileForm";
import { completeness } from "../../../lib/facultyProfile";

const LABEL: Record<string, string> = { INSTRUCTOR: "Course Instructor", SUBJECT_EXPERT: "Subject Expert", LAB_ENGINEER: "Lab Engineer", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", CHAIRMAN: "Institute Head" };

export default async function FacultyProfilePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const me = (user as { realUserId?: string }).realUserId || user.id;
  const [profile, records] = await Promise.all([
    prisma.facultyProfile.findUnique({ where: { userId: me } }),
    prisma.facultyRecord.findMany({ where: { userId: me }, orderBy: [{ startYear: "desc" }, { createdAt: "desc" }] }),
  ]);
  const score = completeness(profile, records.filter((r) => r.kind === "EDUCATION").length);
  return (
    <Shell roleLabel={LABEL[user.role] || "Faculty"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Profile</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 10 }}>
        Your details, education, experience, research, grants, projects and events. The department and the institute use this to produce the faculty details reports.
        Profile complete: <b>{score}%</b>
      </p>
      <FacultyProfileForm
        name={user.name}
        profile={profile ? { ...profile, dateOfJoining: profile.dateOfJoining?.toISOString() || null, dateOfBirth: profile.dateOfBirth?.toISOString() || null } : null}
        records={records.map((r) => ({ ...r, createdAt: undefined }) as never)}
      />
    </Shell>
  );
}
