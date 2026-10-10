import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import LibraryInventoryForm from "../../components/LibraryInventoryForm";
import ExcelImportButton from "../../components/ExcelImportButton";
import { libraryScope } from "../../lib/resources";

const LABEL: Record<string, string> = { LIBRARIAN: "Librarian", LAB_MANAGER: "Lab Manager", CHAIRMAN: "Institute Head", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator" };

export default async function LibraryInventoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await libraryScope(user);
  if (!scope) redirect("/dashboard");
  const [lib, students] = await Promise.all([
    prisma.libraryInfo.findUnique({ where: { chairmanId: scope.chairmanId } }),
    prisma.student.count({ where: { batch: { coordinator: { managedById: scope.chairmanId } } } }),
  ]);
  const per = (n: number) => (students > 0 ? (Math.round((n / students) * 100) / 100).toString() : "—");
  const cards: [string, string | number][] = [
    ["Book titles", lib?.totalTitles ?? 0], ["Computing titles", lib?.computingTitles ?? 0], ["Students", students],
    ["Titles per student", per(lib?.totalTitles ?? 0)], ["Computing titles per student", per(lib?.computingTitles ?? 0)],
    ["Students per reading seat", lib && lib.seats > 0 ? (Math.round((students / lib.seats) * 10) / 10).toString() : "—"],
  ];
  return (
    <Shell roleLabel={LABEL[user.role] || "Library"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Library Inventory</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        What the library holds. The Librarian keeps it up to date and the Institute Head can correct it; the ratios below are worked out from it and the student lists.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {cards.map(([l, v]) => (
          <div key={l} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 140 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <a className="btn" href="/api/library-inventory/export">Download Excel</a>
        {scope.canEdit && <ExcelImportButton endpoint="/api/library-inventory/import" label="Import from Excel" />}
      </p>
      <LibraryInventoryForm key={lib ? lib.updatedAt.getTime() : "none"} canEdit={scope.canEdit}
        lib={lib ? { seats: lib.seats, totalTitles: lib.totalTitles, computingTitles: lib.computingTitles, totalVolumes: lib.totalVolumes, printJournals: lib.printJournals, ebooks: lib.ebooks, databases: lib.databases, openHoursPerWeek: lib.openHoursPerWeek, hasLibrarian: lib.hasLibrarian, lastStockCheck: lib.lastStockCheck ? lib.lastStockCheck.toISOString() : null, notes: lib.notes } : null} />
    </Shell>
  );
}
