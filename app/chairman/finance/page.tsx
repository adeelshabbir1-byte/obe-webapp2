import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import FinanceManager from "../../../components/FinanceManager";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, fiscalYearNow, recentFiscalYears } from "../../../lib/resources";
import FeesScholarships from "../../../components/FeesScholarships";
import { loadAccounts, programsOf, SCHOLARSHIP_SCHEMES } from "../../../lib/accounts";
import { money } from "../../../lib/remediation";
import Link from "next/link";

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
  // Remediation tutorials: fees collected and what the teachers are paid from them.
  const tutorials = await (async () => {
    const plans = await prisma.remediationPlan.findMany({ where: { chairmanId: scope.chairmanId } });
    const enr = plans.length ? await prisma.remediationEnrollment.findMany({ where: { planId: { in: plans.map((p) => p.id) } } }) : [];
    return plans.reduce((a, p) => { const m = money(p, enr.filter((e) => e.planId === p.id)); return { plans: a.plans + 1, collected: a.collected + m.collected, due: a.due + m.due, share: a.share + m.share, paid: a.paid + m.paidOut }; }, { plans: 0, collected: 0, due: 0, share: 0, paid: 0 });
  })().catch(() => null);
  const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
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
      {tutorials && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Remediation tutorial fees and teacher pay</h3>
            <Link href="/remediation?tab=fees" className="btn btn-secondary btn-sm">Open</Link>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginTop: 8 }}>
            <span>{tutorials.plans} remediation plan(s)</span><span>Collected: <b>{pkr(tutorials.collected)}</b></span><span>Still due: <b>{pkr(tutorials.due)}</b></span>
            <span>Teachers&apos; share: <b>{pkr(tutorials.share)}</b></span><span>Paid to teachers: <b>{pkr(tutorials.paid)}</b></span>
          </div>
        </div>
      )}
    </Shell>
  );
}
