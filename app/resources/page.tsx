import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { fiscalYearNow, labRatio } from "../../lib/resources";

const when = (d?: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");
const money = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
const card = { background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px" } as const;

export default async function ResourcesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");
  const id = user.id;
  const year = fiscalYearNow();
  const changes = (await prisma.changeLog.findMany({ where: { chairmanId: id } as never, orderBy: { createdAt: "desc" }, take: 15 })) as unknown as { id: string; area: string; summary: string; byId: string; createdAt: Date }[];
  const changers = (await prisma.user.findMany({ where: { id: { in: Array.from(new Set(changes.map((c) => c.byId))).concat(["none"]) } }, select: { id: true, name: true } })) as unknown as { id: string; name: string }[];
  const changer = new Map<string, string>(changers.map((u) => [u.id, u.name]));

  const [ratio, labLast, lib, fin, finLast, crit, staff, programs] = await Promise.all([
    labRatio(id, null),
    prisma.labInfo.findFirst({ where: { chairmanId: id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, updatedById: true } }),
    prisma.libraryInfo.findUnique({ where: { chairmanId: id } }),
    prisma.financeEntry.findMany({ where: { chairmanId: id, fiscalYear: year } }),
    prisma.financeEntry.findFirst({ where: { chairmanId: id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.admissionCriteria.findMany({ where: { chairmanId: id }, select: { updatedAt: true, updatedById: true, minPercentage: true } }),
    prisma.user.findMany({ where: { managedById: id, role: { in: ["LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS"] as never }, isActive: true }, select: { name: true, role: true } }),
    prisma.departmentProgram.count({ where: { department: { chairmanId: id } } }),
  ]);
  const ids = Array.from(new Set([labLast?.updatedById, lib?.updatedById, ...(crit as unknown as { updatedById: string | null }[]).map((c) => c.updatedById)].filter((x): x is string => !!x)));
  const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: ids.length ? ids : ["none"] } }, select: { id: true, name: true } })).map((u) => [u.id as string, u.name as string]));
  const by = (x?: string | null) => (x ? ` by ${names.get(x) || "someone"}` : "");
  const holders = (r: string) => staff.filter((s) => String(s.role) === r).map((s) => s.name).join(", ");
  const sum = (k: string) => fin.filter((f) => f.kind === k).reduce((n, f) => n + f.amount, 0);
  const critRows = crit as unknown as { updatedAt: Date; updatedById: string | null; minPercentage: number | null }[];
  const newest = critRows.slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const critLast = newest ? newest.updatedAt : null;
  const critBy = newest?.updatedById;

  const tile = (l: string, v: string | number) => (
    <div key={l}><div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div></div>
  );
  const section = (title: string, role: string, who: string, updated: string, tiles: [string, string | number][], href: string, open: string) => (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <Link href={href} className="btn" style={{ textDecoration: "none" }}>{open}</Link>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--slate)", margin: "4px 0 10px" }}>
        {role}: {who ? <b style={{ color: "inherit" }}>{who}</b> : <span style={{ color: "#B3261E" }}>no login yet (<Link href="/chairman/staff">create one</Link>)</span>} · last updated {updated}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>{tiles.map(([l, v]) => tile(l, v))}</div>
    </div>
  );

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Resources</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Labs, library, finance and admissions in one place. Each is kept up to date by its own department; open any of them to correct a figure.
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        {section("Computer labs", "Kept by the Lab Manager", holders("LAB_MANAGER"), `${when(labLast?.updatedAt)}${by(labLast?.updatedById)}`,
          [["Labs", ratio.labs], ["Computers", ratio.computers], ["Working", ratio.working], ["Students", ratio.students], ["Students per working computer", ratio.perComputer ?? "—"]], "/lab-inventory", "Open lab inventory")}
        {section("Library", "Kept by the Librarian", holders("LIBRARIAN"), `${when(lib?.updatedAt)}${by(lib?.updatedById)}`,
          [["Book titles", lib?.totalTitles ?? 0], ["Computing titles", lib?.computingTitles ?? 0], ["Volumes", lib?.totalVolumes ?? 0], ["Reading seats", lib?.seats ?? 0], ["Print journals", lib?.printJournals ?? 0], ["E-books", lib?.ebooks ?? 0]], "/library-inventory", "Open library record")}
        {section(`Finance ${year}`, "Kept by the Finance Officer", holders("FINANCE_OFFICER"), when(finLast?.updatedAt),
          [["Budget", money(sum("BUDGET"))], ["Spent", money(sum("SPENT"))], ["Income", money(sum("INCOME"))]], "/chairman/finance", "Open finance")}
        {section("Admission criteria", "Kept by Student Affairs", holders("STUDENT_AFFAIRS"), `${when(critLast)}${by(critBy)}`,
          [["Programs", programs], ["Programs with criteria set", crit.length], ["Lowest minimum %", critRows.length ? Math.min(...critRows.map((c) => c.minPercentage ?? 100)) : "—"]], "/admission-criteria", "Open admission criteria")}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 14 }}>
        Need a login for one of these departments? <Link href="/chairman/staff">Create or view their logins</Link>. A Lab Manager made here looks after the labs of every department.
      </p>
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Recent changes</h3>
        {changes.length === 0 ? <p style={{ color: "var(--slate)", margin: 0, fontSize: 13 }}>No changes recorded yet. From now on every save to the library, finance, admission or lab figures is listed here with who made it.</p> : (
          <table><thead><tr><th>When</th><th>Area</th><th>Change</th><th>By</th></tr></thead>
            <tbody>{changes.map((c) => <tr key={c.id}><td style={{ whiteSpace: "nowrap" }}>{c.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{c.area}</td><td>{c.summary}</td><td>{changer.get(c.byId) || "—"}</td></tr>)}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
