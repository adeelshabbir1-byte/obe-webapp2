import { getSignedInUser } from "../lib/session";
import { getBrandingFor } from "../lib/branding";
import { getRequestsCount, getSessionInfo, getSidebarCurrentTerm } from "../lib/shellData";
import AppShell from "./AppShell";
import { unreadCount } from "../lib/notifications";
import { prisma } from "../lib/db";

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

  const [branding, sessionInfo, requestsCount, currentTerm, unreadNotifications] = await Promise.all([
    getBrandingFor(user),
    user ? getSessionInfo(user) : null,
    user ? getRequestsCount(user) : 0,
    // Shown as a standing reminder on every Program Lead / Program Coordinator page — several screens
    // (reports, the registration window, degree planning) depend on which term is "current".
    user && (roleLabel === "Program Lead" || roleLabel === "Program Coordinator") ? getSidebarCurrentTerm(user) : null,
    user ? unreadCount(user.id) : 0,
  ]);
  // Advising is a per-batch duty, not a role: anyone named a batch's Advisor gets the Advisor Dashboard in every role's menu.
  const advises = user && !navLinks.some((l) => l.href === "/advisor/dashboard") ? (await prisma.batch.count({ where: { advisorId: user.id } }).catch(() => 0)) > 0 : false;
  const links = advises ? [...navLinks, { href: "/advisor/dashboard", label: "Advisor Dashboard" }] : navLinks;

  return (
    <AppShell
      roleLabel={roleLabel}
      userName={userName}
      navLinks={links}
      branding={branding}
      roleSwitch={sessionInfo?.dualCapable ? sessionInfo : null}
      deptCoordinator={sessionInfo?.deptCoordinator || null}
      isAlumniCustodian={!!sessionInfo?.isAlumniCustodian}
      currentTerm={currentTerm}
      requestsCount={requestsCount}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </AppShell>
  );
}
