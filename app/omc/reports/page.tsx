import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";

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

const CARDS = [
  { href: "/omc/reports/coverage", title: "Program-Level PLO Coverage & Distribution Summary", desc: "How comprehensively the program addresses each PLO-1 through PLO-10, highlighting under-mapped outcomes." },
  { href: "/omc/reports/heatmap", title: "PLO Depth & Contribution Heatmap", desc: "Breaks down mapping by course type (Core, Elective, IDS, General Education...) to check whether core courses carry the primary weight." },
  { href: "/omc/reports/progression", title: "Semester-Wise PLO Progression & Balance", desc: "Evaluates how outcomes scale across semesters — foundational PLOs early, advanced ones later." },
  { href: "/omc/reports/audit", title: "Course-Level Accreditation Audit & Orphan Detection", desc: "Flags orphan courses (no PLO mapped) and overly broad courses (mapped to every PLO indiscriminately)." },
  { href: "/omc/reports/bloom", title: "CLO Bloom's Taxonomy Distribution", desc: "Whether higher-order thinking (Analyze / Evaluate / Create) is adequately represented as students progress." },
];

export default async function ReportsHubPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reports</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every report is exportable to Excel.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {CARDS.map((c) => (
          <a key={c.href} href={c.href} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--brass-dark)" }}>{c.title}</h3>
            <p style={{ fontSize: 12, color: "var(--slate)" }}>{c.desc}</p>
          </a>
        ))}
      </div>
    </Shell>
  );
}
