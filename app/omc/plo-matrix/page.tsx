import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PloMatrix from "../../../components/PloMatrix";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function OmcPloMatrixPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" },
    orderBy: { name: "asc" },
  });

  const programs = [];
  for (const coord of coordinators) {
    const courses = await prisma.course.findMany({
      where: { coordinatorId: coord.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });
    programs.push({
      coordinatorId: coord.id, coordinatorName: coord.name,
      plos: plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
      courses: courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
        mappedPloIds: c.ploMappings.map((m) => m.ploId),
      })),
    });
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO–Course Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Assign which PLOs each course contributes to. Check a box to map it — no need to add rows one at a time.
      </p>
      <PloMatrix programs={programs} />
    </Shell>
  );
}
