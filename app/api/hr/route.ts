import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb, post } from "../../../lib/erp";
import { parseLines, staffOf, computeSlip } from "../../../lib/hr";
import { withErrors } from "../../../lib/apiHandler";

// HR & payroll (Institute Head / Finance): pay structures, monthly payroll runs (draft → approved → paid) posted to the accounts.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.hr) return NextResponse.json({ error: "Only the Institute Head or Finance manage HR and payroll." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "setPay") {
      const staff = await staffOf(acc.chairmanId);
      if (!staff.some((s) => s.id === b.userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
      const data = { basic: Math.max(0, Number(b.basic) || 0), allowancesJson: JSON.stringify(parseLines(b.allowances)), deductionsJson: JSON.stringify(parseLines(b.deductions)), taxPct: Math.min(50, Math.max(0, Number(b.taxPct) || 0)), bank: b.bank ? String(b.bank).slice(0, 60) : null, account: b.account ? String(b.account).slice(0, 40) : null };
      await edb.payStructure.upsert({ where: { userId: String(b.userId) }, create: { userId: String(b.userId), ...data }, update: data });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "createRun") {
      const month = String(b.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Choose the month." }, { status: 400 });
      if (await edb.payrollRun.count({ where: { chairmanId: acc.chairmanId, month } })) return NextResponse.json({ error: "A payroll for that month already exists." }, { status: 409 });
      const staff = (await staffOf(acc.chairmanId)).filter((s) => s.pay && s.pay.basic > 0);
      if (!staff.length) return NextResponse.json({ error: "Set pay structures first." }, { status: 400 });
      const run = await edb.payrollRun.create({ data: { chairmanId: acc.chairmanId, month, createdById: user.id } });
      const slips = staff.map((s) => { const c = computeSlip(s.pay!); return { runId: run.id, userId: s.id, gross: c.gross, deductions: c.deductions, tax: c.tax, net: c.net, linesJson: JSON.stringify(c.lines) }; });
      await edb.payslip.createMany({ data: slips });
      const tot = slips.reduce((t, s) => ({ gross: t.gross + s.gross, tax: t.tax + s.tax, deductions: t.deductions + s.deductions, net: t.net + s.net, people: t.people + 1 }), { gross: 0, tax: 0, deductions: 0, net: 0, people: 0 });
      await edb.payrollRun.update({ where: { id: run.id }, data: { totalsJson: JSON.stringify(tot) } });
      return NextResponse.json({ ok: true });
    }
    const run = (await edb.payrollRun.findFirst({ where: { id: String(b.runId || ""), chairmanId: acc.chairmanId } })) as { id: string; month: string; status: string; totalsJson: string } | null;
    if (!run) return NextResponse.json({ error: "payroll not found" }, { status: 404 });
    const t = JSON.parse(run.totalsJson || "{}") as { gross: number; tax: number; deductions: number; net: number };
    if (b.action === "deleteRun" && run.status === "DRAFT") { await edb.payslip.deleteMany({ where: { runId: run.id } }); await edb.payrollRun.delete({ where: { id: run.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "approveRun" && run.status === "DRAFT") {
      if (user.role !== "CHAIRMAN" && user.role !== "FINANCE_OFFICER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
      await edb.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED" } });
      await post(acc.chairmanId, user.id, `Payroll ${run.month}`, [["5000", t.gross, 0], ["2200", 0, t.tax], ["2100", 0, t.net + t.deductions]], "PAYROLL", run.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "payRun" && run.status === "APPROVED") {
      await edb.payrollRun.update({ where: { id: run.id }, data: { status: "PAID" } });
      await post(acc.chairmanId, user.id, `Salaries paid ${run.month}`, [["2100", t.net, 0], ["1010", 0, t.net]], "PAYROLL_PAID", run.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Not possible in this state." }, { status: 400 });
  } catch { return NextResponse.json({ error: "HR is not set up yet — run prisma/migration_erp.sql." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
