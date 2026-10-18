"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { moduleForPath } from "../lib/modules";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { greetingName } from "../lib/names";
import { BRAND, sized } from "../lib/brandAssets";
import HelpButton from "./help/HelpButton";
import { AttendanceWarning } from "./attendance/StudentAttendance";

const NAV = [
  { href: "/student/registration", label: "Course Registration" },
  { href: "/student/degree-plan", label: "Degree Plan" },
  { href: "/student/dashboard", label: "Elective Choices" },
  { href: "/student/timetable", label: "My Timetable" },
  { href: "/student/exams", label: "My Exams" },
  { href: "/student/quizzes", label: "Online Quizzes" },
  { href: "/student/submissions", label: "Submit Work" },
  { href: "/student/fyp", label: "Final Year Project" },
  { href: "/student/cv", label: "My Profile & CV" },
  { href: "/student/fees", label: "My Fees" },
  { href: "/student/activities", label: "Societies & Activities" },
  { href: "/student/transcript", label: "My Transcript" },
  { href: "/student/obe-analytics", label: "My OBE Progress" },
  { href: "/student/portfolio", label: "My Portfolio" },
  { href: "/student/course-survey", label: "Course Surveys & Evaluations" },
  { href: "/student/attendance", label: "My Attendance" },
  { href: "/student/placements", label: "Internships & Jobs" },
  { href: "/student/complaints", label: "Complaints" },
  { href: "/student/alerts", label: "Alerts & Contact" },
  { href: "/student/help", label: "Help" },
];

/** Header + tab navigation shared by every student-portal page. */
export default function StudentShell({ studentName, children }: { studentName?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  // Licensing: hide links to modules the institute has not bought; say so when a closed page sent the student here.
  const [off, setOff] = useState<string[]>([]);
  const [lockedNote, setLockedNote] = useState("");
  useEffect(() => {
    fetch("/api/student/modules").then((r) => r.json()).then((d) => setOff(Array.isArray(d.locked) ? d.locked : [])).catch(() => {});
    try { if (new URLSearchParams(window.location.search).get("locked")) setLockedNote("That part of the portal is not available at your institute."); } catch { /* ignore */ }
  }, []);
  const nav = off.length ? NAV.filter((l) => { const m = moduleForPath(l.href); return !m || !off.includes(m.key); }) : NAV;

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/student/logout", { method: "POST" });
    } finally {
      router.push("/student/login");
      router.refresh();
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="st-top no-print">
        <div className="st-top-inner">
          <Link href="/student/registration" className="st-brand" aria-label="OBEHUB student portal">
            <img className="sb-mark" src={BRAND.mark.src} alt="" {...sized(BRAND.mark, 28)} />
            <img className="sb-word" src={BRAND.wordmark.src} alt="OBEHUB" {...sized(BRAND.wordmark, 18)} />
          </Link>
          <nav className="st-nav" aria-label="Student portal">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <HelpButton audience="student" />
            {studentName && <span className="tb-hello">Hello, <b>{greetingName(studentName)}</b></span>}
            <button type="button" className="tb-icon-btn" onClick={logout} disabled={leaving} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="st-main">{lockedNote && <div className="card" style={{ borderLeft: "4px solid #B7791F", fontSize: 13 }}>{lockedNote}</div>}{pathname !== "/student/attendance" && <AttendanceWarning />}{children}</main>
    </div>
  );
}
