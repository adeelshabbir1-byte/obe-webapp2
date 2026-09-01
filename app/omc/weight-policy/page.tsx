import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import WeightPolicyManager from "../../../components/WeightPolicyManager";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/reports", label: "Reports" },
];

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

export default async function WeightPolicyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const existing = await prisma.weightPolicy.findMany({ where: { chairmanId: user.managedById || "" } });
  const byType = new Map(existing.map((p) => [p.courseType, p]));
  const policies = COURSE_TYPES.map((t) => byType.get(t) || {
    courseType: t,
    assignmentMin: 0, assignmentMax: 100, assignmentMinCount: 1,
    quizMin: 0, quizMax: 100, quizMinCount: 1,
    projectMin: 0, projectMax: 100, projectMinCount: 0,
    labMin: 0, labMax: 100, labMinCount: 0,
    midtermMin: 0, midtermMax: 100, midtermMinCount: 1,
    finalMin: 0, finalMax: 100, finalMinCount: 1,
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Weight Policy</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Define the allowed assessment weight range per course type (e.g. Core: Assignment 10-15%, Quiz 5-10%,
        Midterm 20-30%, Final 50-60%). Subject Experts must stay within these ranges, or their proposed
        weights come to you as an exception request.
      </p>
      <WeightPolicyManager initialPolicies={policies as any} />
    </Shell>
  );
}
