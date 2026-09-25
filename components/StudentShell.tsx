"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { greetingName } from "../lib/names";

const NAV = [
  { href: "/student/registration", label: "Course Registration" },
  { href: "/student/degree-plan", label: "Degree Plan" },
  { href: "/student/dashboard", label: "Elective Choices" },
  { href: "/student/obe-analytics", label: "My OBE Progress" },
];

/** Header + tab navigation shared by every student-portal page. */
export default function StudentShell({ studentName, children }: { studentName?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

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
      <header className="st-top">
        <div className="st-top-inner">
          <Link href="/student/registration" className="st-brand" aria-label="OBEHUB student portal">
            <img className="sb-mark" src="/brand/obehub-mark.webp" alt="" width={36} height={34} />
            <img className="sb-word" src="/brand/obehub-wordmark-only.webp" alt="OBEHUB" width={110} height={18} />
          </Link>
          <nav className="st-nav" aria-label="Student portal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {studentName && <span className="tb-hello">Hello, <b>{greetingName(studentName)}</b></span>}
            <button type="button" className="tb-icon-btn" onClick={logout} disabled={leaving} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="st-main">{children}</main>
    </div>
  );
}
