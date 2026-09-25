import { getAuthenticatedUser } from "../lib/session";
import { getBrandingFor } from "../lib/branding";
import { prisma } from "../lib/db";
import AppShell from "./AppShell";

/**
 * Server wrapper for the app chrome. Everything the sidebar needs (branding,
 * role-switch capability, current term) is resolved here during the page's
 * own server render — previously the client fetched three API routes after
 * every navigation, which re-downloaded base64 logos and made the sidebar
 * flicker in. The user lookup is memoised per request, so this adds no extra
 * session query on top of the page's own.
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
  const user = await getAuthenticatedUser();

  const [branding, currentTerm] = await Promise.all([
    getBrandingFor(user),
    // Standing reminder on every Coordinator page of which term is "current" —
    // several screens (reports, registration window, degree planning) depend on it.
    roleLabel === "Program Coordinator" && user?.role === "PROGRAM_COORDINATOR"
      ? prisma.currentTerm.findUnique({ where: { coordinatorId: user.id }, select: { termName: true, year: true } })
      : Promise.resolve(null),
  ]);

  const dualCapable = user?.rawRole === "SUBJECT_EXPERT" && user?.secondaryRole === "INSTRUCTOR";

  return (
    <AppShell
      roleLabel={roleLabel}
      userName={userName}
      navLinks={navLinks}
      branding={branding}
      roleSwitch={dualCapable && user ? { activeRole: user.role } : null}
      isAlumniCustodian={!!user?.isAlumniCustodian}
      currentTerm={currentTerm}
    >
      {children}
    </AppShell>
  );
}
