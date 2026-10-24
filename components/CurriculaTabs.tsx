import Link from "next/link";

// One "Curricula" area: National Curricula (HEC / council level), University Curricula (an institute's own and
// affiliated copies), the Builder, and the Super Admin's admin page — the same tabs on each.
export default function CurriculaTabs({ active, showAdmin, showBuilder = true, showUniversity = true }: { active: "national" | "university" | "builder" | "admin"; showAdmin?: boolean; showBuilder?: boolean; showUniversity?: boolean }) {
  const tabs: [string, string, string, boolean][] = [
    ["national", "/curricula?show=national", "National Curricula", true],
    ["university", "/curricula?show=university", "University Curricula", showUniversity],
    ["builder", "/curricula/builder", "Curriculum Builder", showBuilder],
    ["admin", "/admin/curricula", "National Curricula — Admin", !!showAdmin],
  ];
  return (
    <nav aria-label="Curricula" className="no-print" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--line)", marginBottom: 14 }}>
      {tabs.filter((t) => t[3]).map(([k, href, label]) => (
        <Link key={k} href={href} aria-current={active === k ? "page" : undefined}
          style={{ padding: "8px 14px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", borderBottom: active === k ? "3px solid var(--crimson, #7A2E3B)" : "3px solid transparent", color: active === k ? "inherit" : "var(--slate)" }}>{label}</Link>
      ))}
    </nav>
  );
}
