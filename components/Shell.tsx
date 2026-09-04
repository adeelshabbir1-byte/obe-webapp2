"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [instituteName, setInstituteName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/institute-info").then((r) => r.json()).then((d) => setInstituteName(d.instituteName)).catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="seal" style={{ width: 36, height: 36, fontSize: 12, margin: "0 0 8px" }}>NC</div>
        <h2 style={{ fontSize: 14, color: "#fff" }}>OBE Curriculum Governance</h2>
        {instituteName && <div style={{ fontSize: 11, color: "#B7AE97", marginTop: 2 }}>{instituteName}</div>}
        <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#B7AE97", margin: "5px 0 20px" }}>
          {roleLabel}
        </div>
        {navLinks.map((n) => (
          <a key={n.href} href={n.href}>{n.label}</a>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 20, paddingTop: 14 }}>
          <div style={{ fontSize: 11.5, color: "#CFC9B6", marginBottom: 8 }}>{userName}</div>
          <a href="/settings/mfa" style={{ display: "block", fontSize: 11.5, color: "#CFC9B6", marginBottom: 8, textDecoration: "underline" }}>Security Settings</a>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#FBC4B4", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>
      <div className="main">
        {children}
        <div style={{ marginTop: 40, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--slate)", textAlign: "center" }}>
          {instituteName ? `${instituteName} — ` : ""}© {new Date().getFullYear()} Lets Innovate. All rights reserved.
        </div>
      </div>
    </div>
  );
}
