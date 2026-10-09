import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FinanceManager from "../../../components/FinanceManager";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, fiscalYearNow, recentFiscalYears } from "../../../lib/resources";

export default async function FinancePage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");
  const years = recentFiscalYears(6);
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : fiscalYearNow();
  const entries = await prisma.financeEntry.findMany({ where: { chairmanId: user.id, fiscalYear: { in: years } } });
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Finance</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The yearly budget, what was actually spent, and the income. Accreditation reviewers ask for the funds set aside for labs, library, faculty development and research.
        Only the Institute Head can see and change this page.
      </p>
      <FinanceManager key={year} years={years} year={year} expense={EXPENSE_CATEGORIES} income={INCOME_CATEGORIES}
        entries={entries.map((e) => ({ fiscalYear: e.fiscalYear, kind: e.kind, category: e.category, amount: e.amount }))} />
    </Shell>
  );
}
