import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PlosManager from "../../../components/PlosManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
];

export default async function CoordinatorPlosPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const plos = await prisma.pLO.findMany({ where: { coordinatorId: user.id }, orderBy: { number: "asc" } });
  const hecPlos = await prisma.masterPLO.findMany({
    where: { masterCurriculum: { authority: "HEC" } },
    orderBy: { number: "asc" },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Learning Outcomes</h1>
        <a href="/api/coordinator/plos/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Define your program's PLOs — copy a starting point from the HEC curriculum or write your own. The Chairman reviews and approves them before Subject Experts map CLOs to them.
      </p>
      <PlosManager
        initialPlos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, description: p.description, status: p.status, chairmanComment: p.chairmanComment, sourceMasterPloNumber: p.sourceMasterPloNumber }))}
        hecPlos={hecPlos.map((h) => ({ number: h.number, title: h.title, description: h.description }))}
      />
    </Shell>
  );
}
