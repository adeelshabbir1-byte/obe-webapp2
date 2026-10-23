"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { moduleForPath } from "../lib/modules";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { greetingName } from "../lib/names";
import { BRAND, sized } from "../lib/brandAssets";
import HelpButton from "./help/HelpButton";
import GlobalSearch from "./GlobalSearch";
import StudentBell from "./StudentBell";
import { AttendanceWarning } from "./attendance/StudentAttendance";
import FeedbackReminder from "./FeedbackReminder";
import { NAV_UR, UI_UR, URDU_FONT, urduStyle } from "../lib/urdu";

const NAV = [
  { href: "/student/registration", label: "Course Registration" },
  { href: "/student/degree-plan", label: "Degree Plan" },
  { href: "/student/dashboard", label: "Elective Choices" },
  { href: "/student/timetable", label: "My Timetable" },
  { href: "/student/exams", label: "My Exams" },
  { href: "/student/quizzes", label: "Online Quizzes" },
  { href: "/student/submissions", label: "Submit Work" },
  { href: "/student/fyp", label: "Final Year Project" },
  { href: "/student/details", label: "My Details" },
  { href: "/student/cv", label: "My Profile & CV" },
  { href: "/student/fees", label: "My Fees" },
  { href: "/student/activities", label: "Societies & Activities" },
  { href: "/student/elections", label: "Society Elections" },
  { href: "/student/transcript", label: "My Transcript" },
  { href: "/student/recheck", label: "Result Re-checking" },
  { href: "/student/obe-analytics", label: "My OBE Progress" },
  { href: "/student/portfolio", label: "My Portfolio" },
  { href: "/student/course-survey", label: "Course Surveys & Evaluations" },
  { href: "/student/attendance", label: "My Attendance" },
  { href: "/student/placements", label: "Internships & Jobs" },
  { href: "/student/counselling", label: "Counselling" },
  { href: "/student/library", label: "Library" },
  { href: "/student/complaints", label: "Complaints" },
  { href: "/student/alerts", label: "Alerts & Contact" },
  { href: "/student/help", label: "Help" },
];

/** Header + tab navigation shared by every student-portal page. */
export default function StudentShell({ studentName, children }: { studentName?: string; children: React.ReactNode }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/student/photo").then((r) => r.json()).then((d) => setPhoto(d.photo || null)).catch(() => null);
    load(); window.addEventListener("student-photo", load); return () => window.removeEventListener("student-photo", load);
  }, []);
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
  // Urdu (right-to-left) menus, chosen per student and remembered in a cookie.
  const [ur, setUr] = useState(false);
  useEffect(() => { try { setUr(/(?:^|; )lang=ur/.test(document.cookie)); } catch { /* ignore */ } }, []);
  const toggleLang = () => { try { document.cookie = `lang=${ur ? "en" : "ur"}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ } setUr(!ur); };
  const L = (href: string, label: string) => (ur && NAV_UR[href]) || label;
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
    <div style={{ minHeight: "100vh", background: "var(--bg)" }} lang={ur ? "ur" : "en"}>
      {ur && <link rel="stylesheet" href={URDU_FONT} />}
      <header className="st-top no-print">
        <div className="st-top-inner">
          <Link href="/student/registration" className="st-brand" aria-label="OBEHUB student portal">
            <img className="sb-mark" src={BRAND.mark.src} alt="" {...sized(BRAND.mark, 28)} />
            <img className="sb-word" src={BRAND.wordmark.src} alt="OBEHUB" {...sized(BRAND.wordmark, 18)} />
          </Link>
          <nav className="st-nav" aria-label="Student portal" style={ur ? urduStyle : undefined}>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>{L(n.href, n.label)}</Link>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {studentName && <GlobalSearch pages={NAV} student />}
            <HelpButton audience="student" />
            {studentName && <StudentBell />}
            <button type="button" className="tb-icon-btn" onClick={toggleLang} title={ur ? "English" : "اردو"} style={{ width: "auto", padding: "0 8px", fontSize: 13 }}>{ur ? "English" : "اردو"}</button>
            {studentName && <span className="tb-hello" style={ur ? urduStyle : undefined}>{ur ? UI_UR.Hello : "Hello"}, <b>{greetingName(studentName)}</b></span>}
            {studentName && <Link href="/student/details" className="avatar" title="My details and photo" style={photo ? { background: `center / cover no-repeat url(${photo})` } : { textDecoration: "none", fontSize: 13 }}>{photo ? "" : studentName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</Link>}
            <button type="button" className="tb-icon-btn" onClick={logout} disabled={leaving} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="st-main">{lockedNote && <div className="card" style={{ borderLeft: "4px solid #B7791F", fontSize: 13 }}>{lockedNote}</div>}{pathname !== "/student/attendance" && <AttendanceWarning />}{pathname !== "/student/course-survey" && <FeedbackReminder />}{children}</main>
    </div>
  );
}
