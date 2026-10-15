import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FinanceManager from "../../../components/FinanceManager";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, fiscalYearNow, recentFiscalYears } from "../../../lib/resources";
import FeesScholarships from "../../../components/FeesScholarships";
import { loadAccounts, programsOf, SCHOLARSHIP_SCHEMES } from "../../../lib/accounts";

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
  // Fee structure and scholarships (new tables: read softly until the migration has been run).
  const [accounts, programs] = await Promise.all([loadAccounts(scope.chairmanId, year).catch(() => null), programsOf(scope.chairmanId)]);
  const sessions = years.map((y) => y);
  return (
    <Shell roleLabel={user.role === "FINANCE_OFFICER" ? "Finance Officer" : "Institute Head"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Finance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The yearly budget, what was actually spent, the income, the fee structure of every program and the scholarships given. Accreditation reviewers ask for the funds set aside for labs, library, faculty development and research.
        The Finance Officer keeps these figures up to date and the Institute Head can correct them. Nobody else can see this page.
      </p>
      <FinanceManager key={`${year}-${entries.filter((e) => e.fiscalYear === year).reduce((n, e) => n + e.amount * (e.kind.length + e.category.length), 0)}`} years={years} year={year} expense={EXPENSE_CATEGORIES} income={INCOME_CATEGORIES}
        entries={entries.map((e) => ({ fiscalYear: e.fiscalYear, kind: e.kind, category: e.category, amount: e.amount }))} />
      {accounts ? (
        <FeesScholarships canEdit={scope.canEdit} programs={programs} sessions={sessions} year={year} schemes={SCHOLARSHIP_SCHEMES} students={accounts.students}
          fees={accounts.fees} scholarships={accounts.scholarships} />
      ) : <div className="err" style={{ marginTop: 14 }}>The fee and scholarship tables are not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
    </Shell>
  );
}
