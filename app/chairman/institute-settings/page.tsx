import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import InstituteSettingsForm from "../../../components/InstituteSettingsForm";
import RecomputeWeightsButton from "../../../components/RecomputeWeightsButton";

export default async function InstituteSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={[
      { href: "/chairman/faculty-workload", label: "Teacher Work Progress" },
      { href: "/chairman/coordinators", label: "Program Leads" },
      { href: "/chairman/plos", label: "Program Learning Outcomes" },
      { href: "/chairman/omc", label: "OMC Members" },
      { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/course-leads", label: "Course Leads" }, { href: "/chairman/departments", label: "Departments" },
      { href: "/chairman/cqi", label: "CQI Records" },
      { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" }, { href: "/omc/course-repositioning", label: "Course Repositioning" }, { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
      { href: "/chairman/institute-settings", label: "Institute Settings" },
      { href: "/omc/reports", label: "Reports" },
    ]}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute Settings</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Shown across every page for your institution.</p>
      <InstituteSettingsForm initialName={fullUser?.instituteName || ""} />
      <RecomputeWeightsButton />
    </Shell>
  );
}
