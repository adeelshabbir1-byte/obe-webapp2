import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CalendarManager from "../../../components/CalendarManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function CalendarPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [holidays, dayModes, courses] = await Promise.all([
    prisma.holiday.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } }),
    prisma.classDayMode.findMany({ where: { coordinatorId: user.id }, orderBy: { date: "asc" } }),
    prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Calendar & Exam Dates</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set exam dates, holidays, and online/on-campus days — all of this feeds into how Instructors' lecture
        dates auto-fill, and into delivery reports.
      </p>
      <CalendarManager
        initialHolidays={holidays.map((h) => ({ id: h.id, date: h.date.toISOString(), label: h.label }))}
        initialDayModes={dayModes.map((m) => ({ id: m.id, date: m.date.toISOString(), mode: m.mode }))}
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, midtermDate: c.midtermDate?.toISOString() || null, finalDate: c.finalDate?.toISOString() || null }))}
      />
    </Shell>
  );
}
