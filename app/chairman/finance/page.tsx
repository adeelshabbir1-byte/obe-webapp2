import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FinanceManager from "../../../components/FinanceManager";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, fiscalYearNow, recentFiscalYears } from "../../../lib/resources";

export default async function FinancePage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = financeScope(user);
  if (!scope) redirect("/dashboard");
  const years = recentFiscalYears(6);
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : fiscalYearNow();
  const entries = await prisma.financeEntry.findMany({ where: { chairmanId: scope.chairmanId, fiscalYear: { in: years } } });
  return (
    <Shell roleLabel={user.role === "FINANCE_OFFICER" ? "Finance Officer" : "Institute Head"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Finance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The yearly budget, what was actually spent, and the income. Accreditation reviewers ask for the funds set aside for labs, library, faculty development and research.
        The Finance Officer keeps these figures up to date and the Institute Head can correct them. Nobody else can see this page.
      </p>
      <FinanceManager key={`${year}-${entries.filter((e) => e.fiscalYear === year).reduce((n, e) => n + e.amount * (e.kind.length + e.category.length), 0)}`} years={years} year={year} expense={EXPENSE_CATEGORIES} income={INCOME_CATEGORIES}
        entries={entries.map((e) => ({ fiscalYear: e.fiscalYear, kind: e.kind, category: e.category, amount: e.amount }))} />
    </Shell>
  );
}
