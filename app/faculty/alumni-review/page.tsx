import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import AlumniReviewManager from "../../../components/AlumniReviewManager";

export default async function AlumniReviewPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!user.isAlumniCustodian) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);

  const [alumni, employers, employmentRaw] = await Promise.all([
    prisma.alumni.findMany({ where: { chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.employer.findMany({ where: { chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.alumniEmployment.findMany({ where: { status: "PENDING", alumni: { chairmanId } }, include: { alumni: true, employer: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const submitterIds = Array.from(new Set([
    ...alumni.map((a) => a.addedById), ...employers.map((e) => e.addedById), ...employmentRaw.map((e) => e.addedById),
  ].filter((id): id is string => !!id)));
  const submitters = submitterIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: submitterIds } } }) : [];
  const nameById = new Map(submitters.map((s) => [s.id, s.name]));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review Alumni & Employer Data</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        You've been designated by your Chairman to review data submitted by any faculty member.
      </p>
      <AlumniReviewManager
        alumni={alumni.map((a) => ({ id: a.id, name: a.name, rollNumber: a.rollNumber, degreeProgram: a.degreeProgram, graduationYear: a.graduationYear, submitterName: a.addedById ? nameById.get(a.addedById) || "—" : "—" }))}
        employers={employers.map((e) => ({ id: e.id, organizationName: e.organizationName, companySize: e.companySize, industryType: e.industryType, submitterName: e.addedById ? nameById.get(e.addedById) || "—" : "—" }))}
        employment={employmentRaw.map((e) => ({ id: e.id, alumniName: e.alumni.name, employerName: e.employer.organizationName, jobTitle: e.jobTitle, submitterName: e.addedById ? nameById.get(e.addedById) || "—" : "—" }))}
      />
    </Shell>
  );
}
