import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CustodianPicker from "../../../components/CustodianPicker";

const NAV = [
  { href: "/chairman/faculty-workload", label: "Teacher Work Progress" },
  { href: "/chairman/coordinators", label: "Program Leads" }, { href: "/course-split", label: "Course Split" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/lab-inventory", label: "Lab Inventory" }, { href: "/chairman/finance", label: "Finance" }, { href: "/move-program", label: "Move Program Data" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" }, { href: "/chairman/people", label: "All Users and Roles" },
  { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/course-leads", label: "Course Leads" }, { href: "/chairman/departments", label: "Departments" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" }, { href: "/omc/course-repositioning", label: "Course Repositioning" }, { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" },
  { href: "/chairman/ai-configuration", label: "AI Configuration" }, { href: "/omc/reports", label: "Reports" },
];

export default async function AlumniCustodianPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { managedById: user.id, role: "PROGRAM_COORDINATOR" } });
  const faculty = await prisma.user.findMany({
    where: { managedById: { in: coordinators.map((c) => c.id) }, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } },
    orderBy: { name: "asc" },
  });
  const all = [...coordinators, ...faculty];
  const current = all.find((u) => u.isAlumniCustodian);

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Alumni Data Custodian</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign who reviews alumni and employer data submitted by your faculty.
      </p>
      <CustodianPicker candidates={all.map((u) => ({ id: u.id, name: u.name, role: u.role }))} currentCustodianId={current?.id || null} />
    </Shell>
  );
}
