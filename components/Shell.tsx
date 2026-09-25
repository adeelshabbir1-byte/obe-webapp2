"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { groupNavLinks } from "../lib/navGrouping";
import { getNavIcon } from "../lib/navIcons";

export default function Shell({
  roleLabel,
  userName,
  navLinks,
  children,
}: {
  roleLabel: string;
  userName: string;
  navLinks: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [instituteName, setInstituteName] = useState<string | null>(null);
  const [instituteLogo, setInstituteLogo] = useState<string | null>(null);
  const [ownerLogo, setOwnerLogo] = useState<string | null>(null);
  const [nceacLogo, setNceacLogo] = useState<string | null>(null);
  const [roleSwitch, setRoleSwitch] = useState<{ dualCapable: boolean; activeRole: string } | null>(null);
  const [isAlumniCustodian, setIsAlumniCustodian] = useState(false);
  const [currentTerm, setCurrentTerm] = useState<{ termName: string; year: number } | null>(null);

  useEffect(() => {
    fetch("/api/institute-info").then((r) => r.json()).then((d) => {
      setInstituteName(d.instituteName); setInstituteLogo(d.instituteLogo);
      setOwnerLogo(d.ownerLogo); setNceacLogo(d.nceacLogo);
    }).catch(() => {});
    fetch("/api/auth/session-info").then((r) => r.json()).then((d) => { if (d.dualCapable) setRoleSwitch(d); if (d.isAlumniCustodian) setIsAlumniCustodian(true); }).catch(() => {});
    // Shown as a standing reminder in the sidebar on every Coordinator
    // page, not just the semester-management one — it's easy to lose
    // track of which term is actually "current" when working across
    // two dozen different pages, and several of them (reports, the
    // registration window, degree planning) all implicitly depend on it.
    if (roleLabel === "Program Coordinator") {
      fetch("/api/coordinator/current-term").then((r) => r.json()).then((d) => setCurrentTerm(d.current)).catch(() => {});
    }
  }, [roleLabel]);

  async function switchRole() {
    if (!roleSwitch) return;
    const nextRole = roleSwitch.activeRole === "INSTRUCTOR" ? "SUBJECT_EXPERT" : "INSTRUCTOR";
    await fetch("/api/auth/set-active-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: nextRole }) });
    router.push("/dashboard");
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <div className="sidebar">
        <div style={{ textAlign: "center" }}>
          {nceacLogo ? (
            <img src={nceacLogo} alt="NCEAC" style={{ width: 40, height: 40, objectFit: "contain", margin: "0 auto 8px", display: "block", background: "#fff", borderRadius: "50%", padding: 2 }} />
          ) : (
            <div className="seal" style={{ width: 36, height: 36, fontSize: 12, margin: "0 auto 8px" }}>NC</div>
          )}
          <h2 style={{ fontSize: 14, color: "#fff" }}>OBE Curriculum Governance</h2>
          {instituteLogo && <img src={instituteLogo} alt={instituteName || "Institute"} style={{ maxWidth: 100, maxHeight: 34, margin: "6px auto 0", display: "block", background: "#fff", padding: 4, borderRadius: 3 }} />}
          {instituteName && <div style={{ fontSize: 11, color: "#B7AE97", marginTop: 2 }}>{instituteName}</div>}
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#B7AE97", margin: "5px 0 20px" }}>
            {roleLabel}
          </div>
          {currentTerm && (
            <Link href="/coordinator/semester" style={{ display: "block", fontSize: 10.5, color: "#D8CFAE", background: "rgba(255,255,255,0.06)", borderRadius: 3, padding: "4px 8px", marginTop: -12, marginBottom: 16, textDecoration: "none" }}>
              Current: {currentTerm.termName} {currentTerm.year}
            </Link>
          )}
        </div>
        {groupNavLinks(navLinks).map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#8A8266", margin: "0 0 4px", paddingLeft: 2 }}>
              {section.title}
            </div>
            {section.links.map((n) => {
              const isActive = pathname === n.href;
              const Icon = getNavIcon(n.label);
              return (
                <Link key={n.href} href={n.href} className="nav-link" style={{
                  display: "flex", alignItems: "center", gap: 9,
                  ...(isActive ? { background: "rgba(91,79,232,0.25)", color: "#fff", fontWeight: 600, borderLeft: "3px solid var(--brass)", paddingLeft: 11 } : {}),
                }}>
                  <Icon size={14} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }} />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 20, paddingTop: 14 }}>
          <div style={{ fontSize: 11.5, color: "#CFC9B6", marginBottom: 8 }}>{userName}</div>
          <Link href="/settings/mfa" style={{ display: "block", fontSize: 11.5, color: "#CFC9B6", marginBottom: 8, textDecoration: "underline" }}>Security Settings</Link>
          {roleSwitch && (
            <button onClick={switchRole} style={{ display: "block", background: "none", border: "none", fontSize: 11.5, color: "#CFC9B6", marginBottom: 8, textDecoration: "underline", cursor: "pointer", padding: 0, textAlign: "left" }}>
              Switch to {roleSwitch.activeRole === "INSTRUCTOR" ? "Subject Expert" : "Instructor"}
            </button>
          )}
          {isAlumniCustodian && (
            <>
              <Link href="/faculty/alumni-review" style={{ display: "block", fontSize: 11.5, color: "#CFC9B6", marginBottom: 8, textDecoration: "underline" }}>
                Review Alumni & Employer Data
              </Link>
              <Link href="/coordinator/surveys" style={{ display: "block", fontSize: 11.5, color: "#CFC9B6", marginBottom: 8, textDecoration: "underline" }}>
                Manage Feedback Surveys
              </Link>
            </>
          )}
          <button onClick={logout} style={{ background: "none", border: "none", color: "#FBC4B4", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>
      <div className="main">
        {children}
        <div style={{ marginTop: 40, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--slate)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {ownerLogo && <img src={ownerLogo} alt="Lets Innovate Pvt Ltd" style={{ height: 16, objectFit: "contain" }} />}
          <span>{instituteName ? `${instituteName} — ` : ""}© {new Date().getFullYear()} Lets Innovate Pvt Ltd. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
