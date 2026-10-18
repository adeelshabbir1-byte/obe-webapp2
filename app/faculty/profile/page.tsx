import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FacultyProfileForm from "../../../components/FacultyProfileForm";
import DetailsForm from "../../../components/DetailsForm";
import { staffDetails } from "../../../lib/aas";
import { selfFields } from "../../../lib/aasFields";
import { completeness, experienceSummary, EXPERIENCE_HEADS, ymText } from "../../../lib/facultyProfile";

const LABEL: Record<string, string> = { INSTRUCTOR: "Course Instructor", SUBJECT_EXPERT: "Subject Expert", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", CHAIRMAN: "Institute Head" };

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
  const exp = experienceSummary(profile?.dateOfJoining, records);
  const score = completeness(profile, records.filter((r) => r.kind === "EDUCATION").length);
  return (
    <Shell roleLabel={LABEL[user.role] || "Faculty"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Profile</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 10 }}>
        Your details, education, experience, research, grants, projects and events. The department and the institute use this to produce the faculty details reports.
        Profile complete: <b>{score}%</b>
      </p>
      <div className="card" style={{ padding: "10px 14px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Your experience</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EXPERIENCE_HEADS.map((h) => (
            <div key={h.key} style={{ border: "1px solid var(--line)", padding: "6px 12px", minWidth: 110 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{ymText(exp[h.key])}</div>
              <div style={{ fontSize: 11, color: "var(--slate)" }}>{h.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>
          Calculated from your Date of joining and each job under Experience (choose its Type: Teaching, Industry, Research or Administration; leave To month and To year blank if you are still there). Overlapping periods count once.
        </div>
      </div>
      <FacultyProfileForm
        name={user.name}
        profile={profile ? { ...profile, dateOfJoining: profile.dateOfJoining?.toISOString() || null, dateOfBirth: profile.dateOfBirth?.toISOString() || null } : null}
        records={records.map((r) => ({ ...r, createdAt: undefined }) as never)}
      />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details for NCEAC (Faculty Directory)</h3>
        <DetailsForm fields={selfFields("staff")} values={{ type: "Local", country: "Pakistan", ...((await staffDetails([user.id])).get(user.id) || {}) }} endpoint="/api/my-details" note="NCEAC's accreditation system asks for these about every teacher. Highest degree only. Dates as dd/mm/yyyy; CNIC as xxxxx-xxxxxxx-x (foreign faculty: passport number). Anything blank here is taken from your profile above." />
      </div>
    </Shell>
  );
}
