import NextStepTip from "./NextStepTip";
import { guideFor } from "../lib/roleGuides";
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
import ReportProblemButton from "./ReportProblemButton";

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
  // A Dean acts as Controller of Examinations while none is named (lib/academicRules.ts).
  const actingCoe = !!user && user.role === "DEAN" && !hats.includes("EXAM_CONTROLLER") && (await (await import("../lib/academicRules")).actingControllerDean(await (await import("../lib/reportScope")).chairmanIdFor(user as never)).catch(() => null)) === user.id;
  // Counselling: batch advisors and the student counsellors Student Affairs designates.
  const counsellor = !!user && (advises || !!(await ((prisma as unknown as Record<string, any>).counsellorProfile?.findUnique({ where: { userId: user.id } }) as Promise<{ isCounsellor: boolean } | null> | undefined)?.catch(() => null))?.isCounsellor);
  // Duties held as hats are separate workspaces (UX review, Nov 2026): working as Dean you see the Dean's menu only;
  // "Working as" at the top of the menu switches to the Controller of Examinations (or QEC, IT Manager …) menu.
  const dutyGroups: { key: string; label: string; home: string; links: { href: string; label: string }[] }[] = [
    ...(hats.includes("EXAM_CONTROLLER") || actingCoe ? [{ key: "EXAM_CONTROLLER", label: "Controller of Examinations", home: "/controller", links: [{ href: "/controller", label: "Controller Dashboard" }, { href: "/exams", label: "Exam Sessions" }, { href: "/academic-rules", label: "Academic Rules & Registration" }, { href: "/status-changes", label: "Student Status Changes" }, { href: "/degrees", label: "Degrees" }, { href: "/accommodations", label: "Student Accommodations" }, { href: "/official-transcript", label: "Official Transcripts" }, { href: "/data-import", label: "Import Old Results & Students" }, { href: "/signed-documents", label: "Signed Documents" }] }] : []),
    ...(hats.includes("QEC_INCHARGE") || hats.includes("QEC_MEMBER") ? [{ key: "QEC", label: "Quality Enhancement Cell", home: "/quality-office", links: [{ href: "/quality-office", label: "Quality Office" }, { href: "/ipe", label: "IPE Self-Assessment" }, { href: "/evaluations", label: "Course & Teacher Evaluations" }, { href: "/evaluations/questionnaires", label: "Feedback Questionnaires" }, { href: "/qaa", label: "QAA Self-Assessment" }, { href: "/plagiarism", label: "Plagiarism Records" }, { href: "/policy-history", label: "Policy Version History" }, { href: "/committees", label: "Committees" }, { href: "/faculty-sufficiency", label: "Faculty Qualification & Sufficiency" }, { href: "/signed-documents", label: "Signed Documents" }] }] : []),
    ...(hats.includes("OMC_CONVENER") ? [{ key: "OMC_CONVENER", label: "OMC Convener", home: "/omc/convener", links: [{ href: "/omc/convener", label: "OMC Convener" }, { href: "/omc/queue", label: "OMC Review Queue" }] }] : []),
    ...(hats.includes("IT_MANAGER") ? [{ key: "IT_MANAGER", label: "IT Manager", home: "/chairman/backups", links: [{ href: "/chairman/backups", label: "Backups" }, { href: "/billing", label: "Subscription & Invoices" }, { href: "/chairman/lms", label: "Moodle Link" }, { href: "/chairman/messaging", label: "SMS & WhatsApp" }, { href: "/data-import", label: "Data Import" }] }] : []),
    ...(hats.includes("CURRICULUM_BUILDER") ? [{ key: "CURRICULUM_BUILDER", label: "Curriculum Builder", home: "/curricula/builder", links: [{ href: "/curricula/builder", label: "National Curriculum Builder" }, { href: "/curricula", label: "National Curricula" }] }] : []),
  ];
  // Duties handed to this person by a head (lib/dutyAssign.ts, lib/collab.ts): their own workspaces too.
  const given = user ? await import("../lib/scopedSettings").then((m) => m.flagsLike(user.id, "duty:")).catch(() => []) : [];
  if (given.some((f) => f.key === "duty:coe") && !dutyGroups.some((g) => g.key === "EXAM_CONTROLLER")) dutyGroups.push({ key: "COE_TEAM", label: "Examinations office", home: "/controller", links: [{ href: "/controller", label: "Controller Dashboard" }] });
  if (given.some((f) => f.key === "duty:affiliation")) dutyGroups.push({ key: "AFFILIATION", label: "Affiliation office", home: "/affiliation", links: [{ href: "/affiliation", label: "Affiliation" }] });
  if (given.some((f) => f.key.startsWith("duty:collab:"))) dutyGroups.push({ key: "COLLAB", label: "Joint degrees & ODL", home: "/collab", links: [{ href: "/collab", label: "Joint degrees and ODL" }] });
  const focusFlag = user && dutyGroups.length ? await import("../lib/scopedSettings").then((m) => m.getFlag(user.id, "menuFocus")).catch(() => null) : null;
  const focus = dutyGroups.find((g) => g.key === focusFlag) || null;
  const dutyLinks = focus ? focus.links : [];
  // Duty pages head the "My duties" group of the lighter menu (lib/roleMenus.ts).
  const dutyHrefs = [...(advises ? ["/advisor/dashboard", "/advisor/registration-holds"] : []), ...(counsellor ? ["/counselling"] : []), ...dutyLinks.map((l) => l.href)];
  const dutyOnly = dutyLinks.filter((l) => !licensed.some((x) => x.href === l.href));
  const rawLinks = [...(advises && needAdvisor ? [...licensed, { href: "/advisor/dashboard", label: "Advisor Dashboard" }, ...(licensed.some((l) => l.href === "/status-changes") ? [] : [{ href: "/status-changes", label: "Student Status Changes" }])] : licensed), ...dutyOnly.filter((l) => !(advises && needAdvisor && l.href === "/status-changes")), ...(counsellor && !licensed.some((l) => l.href === "/counselling") ? [{ href: "/counselling", label: "Counselling" }] : [])];
  // The institute's own position titles (VC, Director of School …) replace the default names in the menu and role label.
  const menuLinks = focus ? focus.links : rawLinks;
  const titles = await titlesFor(user && user.role !== "SUPER_USER" ? await instituteOfUser({ id: user.id, role: (user as { rawRole?: string }).rawRole || user.role, managedById: user.managedById ?? null }).catch(() => null) : null);
  // My Approvals: every member of staff gets it, with a count of what is waiting for them (cached for a few minutes).
  const staffUser = !!user && !["STUDENT", "SUPER_USER"].includes(String((user as { rawRole?: string }).rawRole || user.role));
  const approvalsCount = staffUser ? await badgeCount(user as never).catch(() => 0) : 0;
  // "What's next": the number of open tasks next to the name (cached for a few minutes).
  // Menu colours (Adeel prompt §1): each page's status for this person, from the same tasks (cached per person).
  const menu = staffUser ? await import("../lib/menuStatus").then((m) => m.menuState(user as never, menuLinks.map((l) => l.href).concat("/approvals"))).catch(() => null) : null;
  const tasksCount = menu ? menu.count : 0;
  // "Report a problem" (pilot): on every page, unless the institute's pilot switch leaves this person out.
  const reportButton = !!user && await import("../lib/problemReports").then((m) => m.showButton(user as never)).catch(() => false);
  const withInbox = staffUser && !menuLinks.some((l) => l.href === "/approvals") ? [{ href: "/approvals", label: "My Approvals" }, ...menuLinks] : menuLinks;
  const links = withInbox.filter((l, i, a) => a.findIndex((x) => x.href === l.href) === i).map((l) => ({ ...l, label: applyTitles(l.label, titles) }));
  const shownRole = focus ? focus.label : applyTitles(roleLabel, titles);
  const workspaces = dutyGroups.length ? [{ key: "", label: applyTitles(roleLabel, titles), home: "/dashboard" }, ...dutyGroups.map((g) => ({ key: g.key, label: g.label, home: g.home }))] : [];
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
      menuRole={focus ? "" : role}
      dutyHrefs={dutyHrefs}
      branding={branding}
      roleSwitch={sessionInfo?.dualCapable ? sessionInfo : null}
      deptCoordinator={sessionInfo?.deptCoordinator || null}
      isAlumniCustodian={!!sessionInfo?.isAlumniCustodian}
      currentTerm={currentTerm}
      requestsCount={requestsCount}
      approvalsCount={approvalsCount}
      tasksCount={tasksCount}
      linkStatus={menu?.statuses || {}}
      look={user && user.role !== "SUPER_USER" ? await import("../lib/brandLookServer").then(async (m) => m.lookOf(await (await import("../lib/branding")).cachedChairmanIdFor(user as never))).catch(() => null) : null}
      display={user ? (await import("../lib/scopedSettings").then((m) => m.getFlag(user.id, "display")).catch(() => null)) || "" : ""}
      lang={user ? (await import("../lib/scopedSettings").then((m) => m.getFlag(user.id, "lang")).catch(() => null)) || "" : ""}
      unreadNotifications={unreadNotifications}
      pins={focus ? [] : pins}
      defaultPins={sessionInfo?.deptCoordinator ? defaultWork(role, links) : []}
      otherWork={sessionInfo?.deptCoordinator ? otherWork : []}
      workspaces={workspaces}
      focus={focus?.key || ""}
    >
      {bill && (
        <div className="no-print" role="alert" style={{ background: bill.lockState === "NONE" && !bill.overdue.length ? "#FFF3DC" : "#FDECEA", border: `1px solid ${bill.lockState === "NONE" && !bill.overdue.length ? "#E0B54A" : "#B3261E"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
          {bill.overdue.length ? <><b>OBEHUB invoice {bill.overdue.map((i) => i.number).join(", ")} overdue</b> (Rs {bill.overdue.reduce((t, i) => t + i.total, 0).toLocaleString("en-PK")}). {bill.lockState === "LOCKED" ? "The modules of your plan are locked until it is paid." : bill.lockState === "READ_ONLY" ? "The modules of your plan are read-only: pages open, but nothing can be saved until it is paid." : bill.graceLeft !== null && bill.graceLeft >= 0 ? `Pay within ${bill.graceLeft} day(s) to keep every module working.` : ""} </> : bill.trialLeft !== null ? <><b>Your OBEHUB trial ends in {bill.trialLeft} day(s).</b> </> : null}
          <a href="/billing" style={{ fontWeight: 700 }}>Plan and invoices →</a>
        </div>
      )}
      {guideFor(role) && <NextStepTip role={role} steps={guideFor(role)!.steps} />}
      {children}
      {reportButton && <ReportProblemButton />}
    </AppShell>
  );
}
