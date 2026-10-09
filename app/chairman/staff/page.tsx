import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import StaffLoginForm from "../../../components/StaffLoginForm";

export default async function StaffPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");
  const [staff, lib, fin] = await Promise.all([
    prisma.user.findMany({ where: { managedById: user.id, role: { in: ["LIBRARIAN", "FINANCE_OFFICER"] as never } }, select: { id: true, name: true, username: true, email: true, role: true, isActive: true, mustChangePassword: true }, orderBy: { name: "asc" } }),
    prisma.libraryInfo.findUnique({ where: { chairmanId: user.id }, select: { updatedAt: true, updatedById: true } }),
    prisma.financeEntry.findFirst({ where: { chairmanId: user.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const when = (d?: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Librarian and Finance logins</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The Librarian keeps the library record and the Finance Officer keeps the budget, spending and income. You can open the Library Inventory and Finance pages at any time and correct anything.
      </p>
      <StaffLoginForm />
      <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Current logins</h3>
        {staff.length === 0 ? <p style={{ color: "var(--slate)" }}>No Librarian or Finance Officer yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Username</th><th>Email</th><th>Status</th></tr></thead>
            <tbody>{staff.map((s) => (
              <tr key={s.id}><td><b>{s.name}</b></td><td>{String(s.role) === "LIBRARIAN" ? "Librarian" : "Finance Officer"}</td><td>{s.username}</td><td>{s.email}</td><td>{!s.isActive ? "Switched off" : s.mustChangePassword ? "Temporary password" : "Active"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Last updated</h3>
        <div style={{ fontSize: 13 }}>Library record: <b>{when(lib?.updatedAt)}</b> · Finance figures: <b>{when(fin?.updatedAt)}</b></div>
      </div>
    </Shell>
  );
}
