"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, LogOut, ShieldCheck, Repeat, HeartHandshake, MessageSquareText, CalendarDays, Home, Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { DEPT_COORDINATOR_PAGES } from "../lib/deptCoordinator";
import { groupNavLinks } from "../lib/navGrouping";
import { getNavIcon } from "../lib/navIcons";
import { greetingName, initials } from "../lib/names";
import { BRAND, sized } from "../lib/brandAssets";
import type { Branding } from "../lib/branding";
import type { SessionInfo } from "../lib/shellData";
import BusyBanner from "./BusyBanner";

type NavLink = { href: string; label: string };

const SCROLL_KEY = "obe:sidebar-scroll";
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Longest nav href that is the current path or a parent of it, so nested pages keep their section highlighted. */
function activeHref(pathname: string, links: NavLink[]) {
  let best = "";
  for (const l of links) {
    if ((pathname === l.href || pathname.startsWith(l.href + "/")) && l.href.length > best.length) best = l.href;
  }
  return best;
}

// Labels some pages pass that name the page rather than a role.
const PAGE_STYLE_LABELS = new Set(["Home", "Yearly summary", "Faculty details", "Report Viewer", "Accreditation", "Requests", "Meetings", "Evidence", "Deadlines", "Plan", "Overview", "Library", "Lab", "Calendar", "Admissions"]);

// Sidebar links are not prefetched: every page here is rendered per request, so a prefetch brings back
// nothing reusable, yet each visible link cost one extra server request on every page view.
export default function AppShell({
  roleLabel,
  userName,
  navLinks,
  branding,
  roleSwitch,
  deptCoordinator: deptCoordinatorProp,
  isAlumniCustodian,
  currentTerm,
  requestsCount,
  children,
}: {
  roleLabel: string;
  userName: string;
  navLinks: NavLink[];
  branding: Branding;
  roleSwitch: SessionInfo | null;
  deptCoordinator: SessionInfo["deptCoordinator"];
  isAlumniCustodian: boolean;
  currentTerm: { termName: string; year: number } | null;
  requestsCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [navOpen, setNavOpen] = useState(false);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
  const [switching, setSwitching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deptCoordinator, setDeptCoordinator] = useState(deptCoordinatorProp);
  const navRef = useRef<HTMLElement>(null);

  // The program picker updates at once when chosen, then follows whatever the server sends after the refresh.
  useEffect(() => { setDeptCoordinator(deptCoordinatorProp); }, [deptCoordinatorProp]);
  // Once the page has re-rendered in the new role, the switch button is usable again
  // (switching while already on the home page keeps this component mounted).
  const activeRole = roleSwitch?.activeRole;
  useEffect(() => { setSwitching(false); }, [activeRole]);

  const links = useMemo(() => {
    const withRequests = navLinks.some((n) => n.href === "/requests") ? navLinks : [...navLinks, { href: "/requests", label: "Requests" }];
    // A department Program Coordinator only sees the pages they may use while working on a program.
    return deptCoordinator
      ? withRequests.filter((n) => n.href === "/dept-coordinator/home" || n.href === "/omc/reports" || DEPT_COORDINATOR_PAGES.includes(n.href))
      : withRequests;
  }, [navLinks, deptCoordinator]);
  const sections = useMemo(() => groupNavLinks(links), [links]);
  const crowded = sections.length > 2;

  // Pages whose own menu already links to the dashboard don't get a second "Home" entry.
  const showHome = !links.some((l) => l.href === "/dashboard");
  const allLinks = useMemo(() => (showHome ? [{ href: "/dashboard", label: "Home" }, ...links] : links), [links, showHome]);
  const current = activeHref(pathname, allLinks);
  const currentLink = allLinks.find((l) => l.href === current);
  const currentSection = sections.find((s) => s.links.some((l) => l.href === current))?.title;
  const crumb = currentLink ? [currentSection, currentLink.label].filter(Boolean).join("  ›  ") : "Workspace";

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

  async function switchRole(nextRole: string) {
    if (!roleSwitch || switching) return;
    setSwitching(true);
    await fetch("/api/auth/set-active-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: nextRole }) });
    router.push("/dashboard");
    router.refresh();
  }

  async function pickProgram(coordinatorId: string) {
    await fetch("/api/auth/acting-for", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinatorId }) });
    setDeptCoordinator((d) => (d ? { ...d, actingForId: coordinatorId } : d));
    router.refresh();
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    try { sessionStorage.removeItem(SCROLL_KEY); } catch { /* ignore */ }
    router.push("/login");
    router.refresh();
  }

  const otherRoles = roleSwitch
    ? (roleSwitch.otherRoles && roleSwitch.otherRoles.length > 0 ? roleSwitch.otherRoles : [{ role: roleSwitch.otherRole || "INSTRUCTOR", label: roleSwitch.otherRoleLabel || "Instructor" }])
    : [];
  const year = new Date().getFullYear();
  const homeActive = current === "/dashboard";

  return (
    <div className="shell" data-nav-open={navOpen ? "true" : "false"}>
      <div className="sb-overlay" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Main navigation">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link prefetch={false} href="/dashboard" className="sb-brand" aria-label="OBEHUB home">
            <img className="sb-mark" src={BRAND.mark.src} alt="" {...sized(BRAND.mark, 35)} />
            <span>
              <img className="sb-word" src={BRAND.wordmark.src} alt="OBEHUB" {...sized(BRAND.wordmark, 22)} />
              <span className="sb-brand-tag" style={{ display: "block" }}>OBE Curriculum Governance</span>
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
              <span className="sb-inst-fallback">NC</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="sb-inst-name">{branding.instituteName || "OBE Curriculum Governance"}</div>
              <span className="sb-inst-role">{roleLabel}</span>
            </div>
          </div>
          {currentTerm && (
            <Link prefetch={false} href="/coordinator/semester" className="sb-term" title="Change the current term">
              <CalendarDays size={14} /> Current: {currentTerm.termName} {currentTerm.year}
            </Link>
          )}
        </div>

        <nav className="sb-nav" ref={navRef}>
          {showHome && (
            <Link prefetch={false} href="/dashboard" className="nav-link" aria-current={homeActive ? "page" : undefined} style={{ marginBottom: 6 }}>
              <span className="nl-icon"><Home size={16} strokeWidth={2.1} /></span>
              <span className="nl-label">Home</span>
            </Link>
          )}
          {sections.map((section, idx) => {
            const hasActive = section.links.some((n) => n.href === current);
            // With many sections only the first and the one you are in are open; click a heading to open or close any.
            const open = openSec[section.title] ?? (!crowded || idx === 0 || hasActive);
            return (
              <div className="sb-section" key={section.title}>
                <button
                  type="button"
                  className="sb-section-title"
                  data-collapsible={crowded ? "true" : "false"}
                  data-active={hasActive ? "true" : "false"}
                  onClick={() => setOpenSec((prev) => ({ ...prev, [section.title]: !open }))}
                  aria-expanded={open}
                >
                  <span>{section.title}</span>
                  {crowded && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                </button>
                {open && section.links.map((n) => {
                  const isActive = n.href === current;
                  const Icon = n.href === "/requests" ? Inbox : getNavIcon(n.label);
                  return (
                    <Link key={n.href} href={n.href} prefetch={false} className="nav-link" aria-current={isActive ? "page" : undefined} title={n.label}>
                      <span className="nl-icon"><Icon size={16} strokeWidth={2.1} /></span>
                      <span className="nl-label">{n.label}</span>
                      {n.href === "/requests" && requestsCount > 0 && <span className="nl-badge" aria-label={`${requestsCount} waiting`}>{requestsCount}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <span className="avatar" aria-hidden="true">{initials(userName)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="sb-user-name" title={userName}>{userName}</div>
              <div className="sb-user-role">{roleLabel}</div>
            </div>
          </div>
          {deptCoordinator && (
            <div className="sb-picker">
              <div className="sb-picker-label">Working on program</div>
              <select value={deptCoordinator.actingForId || ""} onChange={(e) => e.target.value && pickProgram(e.target.value)} aria-label="Working on program">
                {!deptCoordinator.actingForId && <option value="">— choose a program —</option>}
                {deptCoordinator.programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div className="sb-actions">
            <Link prefetch={false} href="/settings/mfa" className="sb-action"><ShieldCheck size={15} /> Security Settings</Link>
            {otherRoles.map((o) => (
              <button key={o.role} type="button" onClick={() => switchRole(o.role)} className="sb-action" disabled={switching}>
                <Repeat size={15} /> {switching ? "Switching…" : `Switch to ${o.label}`}
              </button>
            ))}
            {isAlumniCustodian && (
              <>
                <Link prefetch={false} href="/faculty/alumni-review" className="sb-action"><HeartHandshake size={15} /> Review Alumni & Employer Data</Link>
                <Link prefetch={false} href="/coordinator/surveys" className="sb-action"><MessageSquareText size={15} /> Manage Feedback Surveys</Link>
              </>
            )}
            <button type="button" onClick={logout} className="sb-action sb-danger" disabled={loggingOut}>
              <LogOut size={15} /> {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <BusyBanner />

      <div className="app-col">
        <header className="topbar">
          <button type="button" className="tb-icon-btn tb-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu size={19} />
          </button>
          <div className="tb-title">
            <h2>{PAGE_STYLE_LABELS.has(roleLabel) ? roleLabel : `${roleLabel} Portal`}</h2>
            <div className="tb-crumb">{crumb}</div>
          </div>
          <div className="tb-right">
            <span className="tb-hello">Hello, <b>{greetingName(userName)}</b></span>
            <span className="avatar" title={userName} aria-hidden="true">{initials(userName)}</span>
            <button type="button" className="tb-icon-btn" onClick={logout} disabled={loggingOut} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="main">
          {children}
          <div className="app-footer">
            {branding.ownerLogoUrl && <img src={branding.ownerLogoUrl} alt="Lets Innovate Pvt Ltd" />}
            <span>{branding.instituteName ? `${branding.instituteName} — ` : ""}© {year} Lets Innovate Pvt Ltd. All rights reserved.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
