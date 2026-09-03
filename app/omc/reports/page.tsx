import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";

const CARDS = [
  { href: "/omc/reports/coverage", title: "Program-Level PLO Coverage & Distribution Summary", desc: "How comprehensively the program addresses each PLO, highlighting under-mapped outcomes." },
  { href: "/omc/reports/heatmap", title: "PLO Depth & Contribution Heatmap", desc: "Breaks down mapping by course type to check whether core courses carry the primary weight." },
  { href: "/omc/reports/progression", title: "Semester-Wise PLO Progression & Balance", desc: "Evaluates how outcomes scale across semesters — foundational PLOs early, advanced ones later." },
  { href: "/omc/reports/audit", title: "Course-Level Accreditation Audit & Orphan Detection", desc: "Flags orphan courses (no PLO mapped) and overly broad courses (mapped to every PLO)." },
  { href: "/omc/reports/bloom", title: "CLO Bloom's Taxonomy Distribution", desc: "Whether higher-order thinking is adequately represented as students progress." },
  { href: "/omc/total-summary", title: "Total Summary", desc: "Every topic's contribution to each CLO, PLO, and assessment type — from the SE's plan." },
  { href: "/omc/adherence-report", title: "Cross-Instructor Comparison", desc: "Compares instructors teaching the same course by adherence to the SE's plan, with charts." },
  { href: "/omc/weight-compliance", title: "Weight Policy Compliance", desc: "Every offered course's weight compliance status, not just pending exceptions." },
  { href: "/omc/submission-timeliness", title: "Submission Timeliness", desc: "Which Subject Experts have submitted their template, and which haven't yet." },
  { href: "/omc/delivery-completion", title: "Instructor Delivery Completion", desc: "How much of the semester each instructor has actually logged." },
  { href: "/omc/plo-readiness", title: "PLO Readiness Matrix", desc: "Every PLO's status across every batch, in one color-coded grid." },
  { href: "/omc/section-utilization", title: "Combined-Section Utilization", desc: "How many sections Course Equivalence groups are saving vs. teaching separately." },
  { href: "/omc/reports/weekly-plan", title: "Tentative Weekly Plan", desc: "The Subject Expert's planned topics, by week — the official course outline." },
  { href: "/omc/reports/log-file", title: "Course Log File", desc: "The Instructor's actual lecture-by-lecture delivery record, with dates and Online/On-Campus mode." },
  { href: "/omc/reports/course-description", title: "Course Description Form", desc: "The full formal course description — weights, CLOs, weekly topics, textbook, and more." },
  { href: "/omc/reports/course-monitoring", title: "Course Monitoring Form", desc: "Weightage, PLO assignment, and plan adherence — with a signature block for printing." },
  { href: "/omc/reports/midterm-distribution", title: "Midterm Paper Distribution", desc: "Which topics and CLOs the midterm's questions actually test, and how much each is worth." },
  { href: "/omc/reports/final-distribution", title: "Final Paper Distribution", desc: "Same breakdown, for the final exam." },
];

export default async function ReportsHubPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reports</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every report is exportable to Excel and printable.
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
