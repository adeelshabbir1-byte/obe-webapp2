"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/chairman/people", label: "All users" },
  { href: "/chairman/coordinators", label: "Program Leads" },
  { href: "/chairman/omc", label: "OMC members" },
  { href: "/chairman/assigners", label: "Course Assigners" },
  { href: "/chairman/faculties", label: "Faculties & Deans" },
  { href: "/chairman/departments", label: "Departments" },
  { href: "/chairman/hierarchy", label: "Institute chart" },
];

/** One place for everyone in the institute: the Institute Head's menu has a single "People & Roles" entry and these tabs. */
export default function PeopleTabs() {
  const path = usePathname();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
      {TABS.map((t) => {
        const on = path === t.href;
        return <Link key={t.href} href={t.href} style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none", borderRadius: 4, background: on ? "var(--brass)" : "transparent", color: on ? "#fff" : "inherit", fontWeight: on ? 700 : 400, border: "1px solid var(--line)" }}>{t.label}</Link>;
      })}
    </div>
  );
}
