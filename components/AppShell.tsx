"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, LogOut, ShieldCheck, Repeat, HeartHandshake, MessageSquareText, CalendarDays, LayoutDashboard } from "lucide-react";
import { groupNavLinks } from "../lib/navGrouping";
import { getNavIcon } from "../lib/navIcons";
import type { Branding } from "../lib/branding";
import { greetingName, initials } from "../lib/names";

type NavLink = { href: string; label: string };

const SCROLL_KEY = "obehub:sidebar-scroll";
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Longest nav href that is the current path or a parent of it, so nested pages keep their section highlighted. */
function activeHref(pathname: string, links: NavLink[]) {
  let best = "";
  for (const l of links) {
    if ((pathname === l.href || pathname.startsWith(l.href + "/")) && l.href.length > best.length) best = l.href;
  }
  return best;
}

export default function AppShell({
  roleLabel,
  userName,
  navLinks,
  branding,
  roleSwitch,
  isAlumniCustodian,
  currentTerm,
  children,
}: {
  roleLabel: string;
  userName: string;
  navLinks: NavLink[];
  branding: Branding;
  roleSwitch: { activeRole: string } | null;
  isAlumniCustodian: boolean;
  currentTerm: { termName: string; year: number } | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "logout" | "switch">("");
  const navRef = useRef<HTMLElement>(null);

  const links = useMemo(
    () => (navLinks.some((l) => l.href === "/dashboard") ? navLinks : [{ href: "/dashboard", label: "Dashboard" }, ...navLinks]),
    [navLinks],
  );
  const sections = useMemo(() => groupNavLinks(links), [links]);
  const current = activeHref(pathname, links);
  const currentLink = links.find((l) => l.href === current);
  const currentSection = sections.find((s) => s.links.some((l) => l.href === current))?.title;
  const crumb = currentLink ? [currentSection && currentSection !== "Overview" ? currentSection : null, currentLink.label].filter(Boolean).join("  ›  ") : "Workspace";
  const firstName = greetingName(userName);

  // Keep the sidebar where the user left it — each page renders its own
  // Shell, so without this the nav list would jump back to the top on every click.
  useIsoLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let restored = false;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved !== null) { el.scrollTop = parseInt(saved, 10) || 0; restored = true; }
    } catch { /* storage unavailable */ }
    const active = el.querySelector<HTMLElement>("a[aria-current=page]");
    if (active) {
      const top = active.offsetTop - el.offsetTop;
      const outOfView = top < el.scrollTop || top + active.offsetHeight > el.scrollTop + el.clientHeight;
      if (!restored || outOfView) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { try { sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop)); } catch { /* ignore */ } });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [navOpen]);

  async function switchRole() {
    if (!roleSwitch) return;
    setBusy("switch");
    const nextRole = roleSwitch.activeRole === "INSTRUCTOR" ? "SUBJECT_EXPERT" : "INSTRUCTOR";
    try {
      await fetch("/api/auth/set-active-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: nextRole }) });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      try { sessionStorage.removeItem(SCROLL_KEY); } catch { /* ignore */ }
      router.push("/login");
      router.refresh();
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="shell" data-nav-open={navOpen ? "true" : "false"}>
      <div className="sb-overlay" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Main navigation">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/dashboard" className="sb-brand" aria-label="OBEHUB home">
            <img className="sb-mark" src="/brand/obehub-mark-v3.webp" alt="" width={44} height={35} />
            <span>
              <img className="sb-word" src="/brand/obehub-wordmark-only-v3.webp" alt="OBEHUB" width={130} height={22} />
              <span className="sb-brand-tag" style={{ display: "block" }}>Outcome · Learn · Assess</span>
            </span>
          </Link>
          <button type="button" className="tb-icon-btn tb-menu" style={{ marginRight: 14 }} onClick={() => setNavOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="sb-inst">
          <div className="sb-inst-row">
            {branding.instituteLogoUrl ? (
              <img className="sb-inst-logo" src={branding.instituteLogoUrl} alt={branding.instituteName || "Institute"} />
            ) : branding.nceacLogoUrl ? (
              <img className="sb-inst-logo" src={branding.nceacLogoUrl} alt="NCEAC" />
            ) : (
              <span className="sb-inst-fallback">{initials(branding.instituteName || "OBE Hub")}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="sb-inst-name">{branding.instituteName || "OBE Curriculum Governance"}</div>
              <span className="sb-inst-role">{roleLabel}</span>
            </div>
          </div>
          {currentTerm && (
            <Link href="/coordinator/semester" className="sb-term" title="Change the current term">
              <CalendarDays size={14} /> Current term: {currentTerm.termName} {currentTerm.year}
            </Link>
          )}
        </div>

        <nav className="sb-nav" ref={navRef}>
          {sections.map((section, i) => (
            <div className="sb-section" key={section.title}>
              <div className="sb-section-title">{section.title === "More" && i === 0 ? "Workspace" : section.title}</div>
              {section.links.map((n) => {
                const isActive = n.href === current;
                const Icon = n.href === "/dashboard" ? LayoutDashboard : getNavIcon(n.label);
                return (
                  <Link key={n.href + n.label} href={n.href} className="nav-link" aria-current={isActive ? "page" : undefined} title={n.label}>
                    <span className="nl-icon"><Icon size={16} strokeWidth={2.1} /></span>
                    <span className="nl-label">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <span className="avatar" aria-hidden="true">{initials(userName)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="sb-user-name" title={userName}>{userName}</div>
              <div className="sb-user-role">{roleLabel}</div>
            </div>
          </div>
          <div className="sb-actions">
            <Link href="/settings/mfa" className="sb-action"><ShieldCheck size={15} /> Security Settings</Link>
            {roleSwitch && (
              <button type="button" onClick={switchRole} className="sb-action" disabled={busy !== ""}>
                <Repeat size={15} /> {busy === "switch" ? "Switching…" : `Switch to ${roleSwitch.activeRole === "INSTRUCTOR" ? "Subject Expert" : "Instructor"}`}
              </button>
            )}
            {isAlumniCustodian && (
              <>
                <Link href="/faculty/alumni-review" className="sb-action"><HeartHandshake size={15} /> Review Alumni & Employer Data</Link>
                <Link href="/coordinator/surveys" className="sb-action"><MessageSquareText size={15} /> Manage Feedback Surveys</Link>
              </>
            )}
            <button type="button" onClick={logout} className="sb-action sb-danger" disabled={busy !== ""}>
              <LogOut size={15} /> {busy === "logout" ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <button type="button" className="tb-icon-btn tb-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu size={19} />
          </button>
          <div className="tb-title">
            <h2>{roleLabel} Portal</h2>
            <div className="tb-crumb">{crumb}</div>
          </div>
          <div className="tb-right">
            <span className="tb-hello">Hello, <b>{firstName}</b></span>
            <span className="avatar" title={userName} aria-hidden="true">{initials(userName)}</span>
            <button type="button" className="tb-icon-btn" onClick={logout} disabled={busy !== ""} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="main">
          {children}
          <footer className="app-footer">
            {branding.ownerLogoUrl && <img src={branding.ownerLogoUrl} alt="Lets Innovate Pvt Ltd" />}
            <span>{branding.instituteName ? `${branding.instituteName} — ` : ""}© {year} Lets Innovate Pvt Ltd. All rights reserved.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
