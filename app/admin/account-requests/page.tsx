import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import AccountRequestsManager from "../../../components/AccountRequestsManager";

const NAV = [
  { href: "/admin/users", label: "Manage Chairmen" },
  { href: "/admin/account-requests", label: "Account Requests" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function AccountRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const requests = await prisma.accountRequest.findMany({
    include: { reviewedBy: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Account Requests</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Requests submitted publicly at <code>/request-account</code>. Approving one creates the Chairman
        account and clones the master curriculum for them automatically — nothing further to run by hand.
      </p>
      <AccountRequestsManager
        initialRequests={requests.map((r) => ({
          id: r.id, name: r.name, email: r.email, institutionName: r.institutionName, phone: r.phone,
          message: r.message, status: r.status, reviewedBy: r.reviewedBy, reviewNote: r.reviewNote,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </Shell>
  );
}
