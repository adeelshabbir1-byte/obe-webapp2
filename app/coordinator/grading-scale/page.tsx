import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import GradingScaleManager from "../../../components/GradingScaleManager";
import CreditLimitsEditor from "../../../components/CreditLimitsEditor";
import { navForRole } from "../../../components/reportNav";


export default async function GradingScalePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const scale = await prisma.gradingScale.findMany({ where: { coordinatorId: user.id }, orderBy: { orderIndex: "asc" } });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Grading Scale</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Which letter grades exist and their GPA value — applies to every course in your program. Instructors
        then set the % cutoff for each of these letters on their own course.
      </p>
      <GradingScaleManager initialScale={scale} />
      <CreditLimitsEditor />
    </Shell>
  );
}
