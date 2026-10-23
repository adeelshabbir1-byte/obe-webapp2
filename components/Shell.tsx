import { getSignedInUser } from "../lib/session";
import { getBrandingFor } from "../lib/branding";
import { getRequestsCount, getSessionInfo, getSidebarCurrentTerm } from "../lib/shellData";
import AppShell from "./AppShell";
import { unreadCount } from "../lib/notifications";
import { prisma } from "../lib/db";
import { navForRole } from "./reportNav";
import { instituteOfUser, lockedModules } from "../lib/moduleLocks";
import { moduleForPath } from "../lib/modules";
import { defaultWork, ROLE_WORK_LABEL } from "../lib/navDefaults";
import { applyTitles, titlesFor } from "../lib/titles";
import { badgeCount } from "../lib/approvals/inbox";

/**
 * Server wrapper for the app chrome. Everything the sidebar needs (branding,
 * role-switch options, department-coordinator programs, open-requests count,
 * current term) is resolved here during the page's own server render —
 * previously the browser fetched four API routes after every navigation,
 * which re-downloaded the base64 logos and made the sidebar fill in late.
 * The signed-in user is memoised per request, so this adds no extra session
 * query on top of the page's own.
 */
export default async function Shell({
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
  // The person themselves (as the sign-in API routes see them), not the Program Lead a department coordinator may be working as.
  const user = await getSignedInUser();

  const needAdvisor = !!user && !navLinks.some((l) => l.href === "/advisor/dashboard");
  const [branding, sessionInfo, requestsCount, currentTerm, unreadNotifications, advises, userPhoto, pinRow] = await Promise.all([
    getBrandingFor(user),
    user ? getSessionInfo(user) : null,
    user ? getRequestsCount(user) : 0,
    // Shown as a standing reminder on every Program Lead / Program Coordinator page — several screens
    // (reports, the registration window, degree planning) depend on which term is "current".
    user && (roleLabel === "Program Lead" || roleLabel === "Program Coordinator") ? getSidebarCurrentTerm(user) : null,
    user ? unreadCount(user.id) : 0,
    user ? prisma.batch.count({ where: { advisorId: user.id } }).then((n) => n > 0).catch(() => false) : false,
    user ? prisma.facultyProfile.findUnique({ where: { userId: user.id }, select: { photo: true } }).then((p) => p?.photo || null).catch(() => null) : null,
    user ? (((prisma as unknown as Record<string, any>).userNavPref?.findUnique({ where: { userId: user.id } }) as Promise<{ pinsJson: string } | null> | undefined)?.catch(() => null) ?? null) : null,
  ]);
  // Advising is a per-batch duty, not a role: anyone named a batch's Advisor gets the Advisor Dashboard in every role's menu.
  // Licensing: links to modules the institute has not bought are left out of the menu.
  const off = user && user.role !== "SUPER_USER" ? await lockedModules(await instituteOfUser({ id: user.id, role: (user as { rawRole?: string }).rawRole || user.role, managedById: user.managedById ?? null }).catch(() => null)) : new Set<string>();
  const licensed = off.size ? navLinks.filter((l) => { const m = moduleForPath(l.href); return !m || !off.has(m.key); }) : navLinks;
  // Duties held as hats (lib/duties.ts) add their pages to whichever role the person is working in.
  const hats = ((user as { extraRoles?: string[] } | null)?.extraRoles || []);
  // Counselling: batch advisors and the student counsellors Student Affairs designates.
  const counsellor = !!user && (advises || !!(await ((prisma as unknown as Record<string, any>).counsellorProfile?.findUnique({ where: { userId: user.id } }) as Promise<{ isCounsellor: boolean } | null> | undefined)?.catch(() => null))?.isCounsellor);
  const dutyLinks = [
    ...(hats.includes("QEC_INCHARGE") ? [{ href: "/evaluations", label: "Course & Teacher Evaluations" }, { href: "/evaluations/questionnaires", label: "Feedback Questionnaires" }, { href: "/qaa", label: "QAA Self-Assessment" }, { href: "/plagiarism", label: "Plagiarism Records" }, { href: "/policy-history", label: "Policy Version History" }, { href: "/committees", label: "Committees" }, { href: "/faculty-sufficiency", label: "Faculty Qualification & Sufficiency" }, { href: "/signed-documents", label: "Signed Documents" }] : []),
    ...(hats.includes("OMC_CONVENER") ? [{ href: "/omc/convener", label: "OMC Convener" }, { href: "/omc/queue", label: "OMC Review Queue" }] : []),
    ...(hats.includes("EXAM_CONTROLLER") ? [{ href: "/controller", label: "Controller Dashboard" }, { href: "/exams", label: "Exam Sessions" }, { href: "/academic-rules", label: "Academic Rules & Registration" }, { href: "/status-changes", label: "Student Status Changes" }, { href: "/degrees", label: "Degrees" }, { href: "/accommodations", label: "Student Accommodations" }, { href: "/official-transcript", label: "Official Transcripts" }, { href: "/signed-documents", label: "Signed Documents" }] : []),
  ];
  // Duty pages head the "My duties" group of the lighter menu (lib/roleMenus.ts).
  const dutyHrefs = [...(advises ? ["/advisor/dashboard", "/advisor/registration-holds"] : []), ...(counsellor ? ["/counselling"] : []), ...dutyLinks.map((l) => l.href)];
  const dutyOnly = dutyLinks.filter((l) => !licensed.some((x) => x.href === l.href));
  const rawLinks = [...(advises && needAdvisor ? [...licensed, { href: "/advisor/dashboard", label: "Advisor Dashboard" }, ...(licensed.some((l) => l.href === "/status-changes") ? [] : [{ href: "/status-changes", label: "Student Status Changes" }])] : licensed), ...dutyOnly.filter((l) => !(advises && needAdvisor && l.href === "/status-changes")), ...(counsellor && !licensed.some((l) => l.href === "/counselling") ? [{ href: "/counselling", label: "Counselling" }] : [])];
  // The institute's own position titles (VC, Director of School …) replace the default names in the menu and role label.
  const titles = await titlesFor(user && user.role !== "SUPER_USER" ? await instituteOfUser({ id: user.id, role: (user as { rawRole?: string }).rawRole || user.role, managedById: user.managedById ?? null }).catch(() => null) : null);
  // My Approvals: every member of staff gets it, with a count of what is waiting for them (cached for a few minutes).
  const staffUser = !!user && !["STUDENT", "SUPER_USER"].includes(String((user as { rawRole?: string }).rawRole || user.role));
  const approvalsCount = staffUser ? await badgeCount(user as never).catch(() => 0) : 0;
  const withInbox = staffUser && !rawLinks.some((l) => l.href === "/approvals") ? [{ href: "/approvals", label: "My Approvals" }, ...rawLinks] : rawLinks;
  const links = withInbox.filter((l, i, a) => a.findIndex((x) => x.href === l.href) === i).map((l) => ({ ...l, label: applyTitles(l.label, titles) }));
  const shownRole = applyTitles(roleLabel, titles);
  // "My work": the person's pins, else the role's default list. People with more than one role also get each other role's work list.
  let pins: string[] | null = null;
  try { pins = pinRow ? JSON.parse(pinRow.pinsJson) : null; } catch { pins = null; }
  const role = user?.role || "";
  const otherWork = (sessionInfo?.dualCapable ? sessionInfo.otherRoles : []).map((o) => {
    const menu = navForRole(o.role);
    return { role: o.role, label: ROLE_WORK_LABEL[o.role] || `${o.label} work`, links: defaultWork(o.role, menu).map((h) => menu.find((l) => l.href === h)).filter((l): l is { href: string; label: string } => !!l) };
  }).filter((w) => w.links.length);

  // Billing: the Institute Head sees overdue OBEHUB invoices, the lock they cause, or a trial ending soon.
  const bill = user && user.role === "CHAIRMAN" ? await (await import("../lib/billing")).billingNotice(user.id).catch(() => null) : null;
  return (
    <AppShell
      roleLabel={shownRole}
      userName={userName}
      userPhoto={userPhoto}
      navLinks={links}
      menuRole={role}
      dutyHrefs={dutyHrefs}
      branding={branding}
      roleSwitch={sessionInfo?.dualCapable ? sessionInfo : null}
      deptCoordinator={sessionInfo?.deptCoordinator || null}
      isAlumniCustodian={!!sessionInfo?.isAlumniCustodian}
      currentTerm={currentTerm}
      requestsCount={requestsCount}
      approvalsCount={approvalsCount}
      unreadNotifications={unreadNotifications}
      pins={pins}
      defaultPins={defaultWork(role, links)}
      otherWork={otherWork}
    >
      {bill && (
        <div className="no-print" role="alert" style={{ background: bill.lockState === "NONE" && !bill.overdue.length ? "#FFF3DC" : "#FDECEA", border: `1px solid ${bill.lockState === "NONE" && !bill.overdue.length ? "#E0B54A" : "#B3261E"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
          {bill.overdue.length ? <><b>OBEHUB invoice {bill.overdue.map((i) => i.number).join(", ")} overdue</b> (Rs {bill.overdue.reduce((t, i) => t + i.total, 0).toLocaleString("en-PK")}). {bill.lockState === "LOCKED" ? "The modules of your plan are locked until it is paid." : bill.lockState === "READ_ONLY" ? "The modules of your plan are read-only: pages open, but nothing can be saved until it is paid." : bill.graceLeft !== null && bill.graceLeft >= 0 ? `Pay within ${bill.graceLeft} day(s) to keep every module working.` : ""} </> : bill.trialLeft !== null ? <><b>Your OBEHUB trial ends in {bill.trialLeft} day(s).</b> </> : null}
          <a href="/billing" style={{ fontWeight: 700 }}>Plan and invoices →</a>
        </div>
      )}
      {children}
    </AppShell>
  );
}
