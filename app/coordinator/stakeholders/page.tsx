import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import StakeholdersManager from "../../../components/StakeholdersManager";
import BulkStakeholderImport from "../../../components/BulkStakeholderImport";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

export default async function StakeholdersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ALLOWED_ROLES.includes(user.role)) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) {
    return (
      <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>No institution is on record for your account — contact your Program Coordinator.</p></div>
      </Shell>
    );
  }

  const [alumni, employers, employment, degrees] = await Promise.all([
    prisma.alumni.findMany({ where: { chairmanId }, orderBy: { graduationYear: "desc" } }),
    prisma.employer.findMany({ where: { chairmanId }, orderBy: { organizationName: "asc" } }),
    prisma.alumniEmployment.findMany({ where: { alumni: { chairmanId } }, orderBy: { startDate: "desc" } }),
    prisma.alumniAdditionalDegree.findMany({ where: { alumni: { chairmanId } }, orderBy: { completionYear: "desc" } }),
  ]);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Alumni & Employers</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Shared across your whole institution — any faculty member can submit a record, but it needs approval
        from your institution's designated data custodian before it's used (e.g. for surveys). An alumni's roll
        number and an employer's name must be unique, so the same person or company is never added twice.
      </p>
      <BulkStakeholderImport />
      <StakeholdersManager
        key={`${alumni.length}-${employers.length}-${employment.length}-${degrees.length}`}
        alumni={alumni.map((a) => ({ id: a.id, name: a.name, email: a.email, rollNumber: a.rollNumber, degreeProgram: a.degreeProgram, graduationYear: a.graduationYear, totalWorkExperienceYears: a.totalWorkExperienceYears, status: a.status }))}
        employers={employers.map((e) => ({ id: e.id, organizationName: e.organizationName, contactName: e.contactName, contactEmail: e.contactEmail, companySize: e.companySize, industryType: e.industryType, status: e.status }))}
        employment={employment.map((e) => ({ id: e.id, alumniId: e.alumniId, employerId: e.employerId, jobTitle: e.jobTitle, startDate: e.startDate ? e.startDate.toISOString().slice(0, 10) : null, endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null, salaryRange: e.salaryRange, status: e.status }))}
        degrees={degrees.map((d) => ({ id: d.id, alumniId: d.alumniId, degreeName: d.degreeName, institution: d.institution, completionYear: d.completionYear, status: d.status }))}
      />
    </Shell>
  );
}
