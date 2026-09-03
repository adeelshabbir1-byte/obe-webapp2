import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import EquivalenceManager from "../../../components/EquivalenceManager";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
  { href: "/omc/total-summary", label: "Total Summary" },
  { href: "/omc/weight-compliance", label: "Weight Compliance" },
  { href: "/omc/submission-timeliness", label: "Submission Timeliness" },
  { href: "/omc/delivery-completion", label: "Delivery Completion" },
  { href: "/omc/plo-readiness", label: "PLO Readiness" },
  { href: "/omc/section-utilization", label: "Section Utilization" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function OmcEquivalencePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Equivalence</h1>
        <a href="/api/omc/equivalence/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Mark courses from different batches or degree programs (even with different codes/names) as the same
        underlying course, so they can be taught together as one combined class. Sections are calculated
        automatically once combined enrollment crosses 50 students.
      </p>
      <EquivalenceManager />
    </Shell>
  );
}
