import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, num, dateOrNull, staffOf } from "../../../lib/registers";
import { BEN_HINT, KINDS, CLAIM, canManageBenefits, type Plan } from "../../../lib/benefits";

/** GET — the employee benefits summary (Word) for NBEAC Form 7. */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !(canManageBenefits(w) || w.leader || w.qec)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const plans = (await rdb.benefitPlan.findMany({ where: { chairmanId: w.chairmanId, active: true }, orderBy: { kind: "asc" } }).catch(() => [])) as Plan[];
  const enr = (await rdb.benefitEnrolment.findMany({ where: { planId: { in: plans.map((p) => p.id).concat(["none"]) }, endDate: null } }).catch(() => [])) as { planId: string }[];
  const staff = (await staffOf(w.chairmanId)).filter((s) => !["SUPER_USER"].includes(s.role)).length;
  const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t || "—", bold, size: 18 })] })] });
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Employee benefits (NBEAC Form 7)")] }),
    new Paragraph({ children: [new TextRun({ text: `${plans.length} benefit plans for ${staff} members of staff. Prepared ${new Date().toLocaleDateString("en-GB")}.`, size: 20 })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: ["Benefit", "Plan / provider", "Coverage and limit", "Who is eligible", "Employer / employee share", "Staff enrolled"].map((h) => cell(h, true)) }),
      ...plans.map((p) => { const n = enr.filter((e) => e.planId === p.id).length; return new TableRow({ children: [cell(KINDS[p.kind] || p.kind), cell([p.name, p.provider, p.policyNo ? `policy ${p.policyNo}` : ""].filter(Boolean).join(", ")), cell([p.coverage, p.limitAmount ? `limit Rs ${p.limitAmount.toLocaleString("en-PK")}` : "", p.dependants ? `dependants: ${p.dependants}` : ""].filter(Boolean).join("; ")), cell(p.eligibility || ""), cell(p.employerSharePct !== null || p.employeeSharePct !== null ? `${p.employerSharePct ?? 0}% / ${p.employeeSharePct ?? 0}%` : ""), cell(`${n}${staff ? ` (${Math.round((100 * n) / staff)}%)` : ""}`)] }); })] }),
  ] }] });
  return new NextResponse((await Packer.toBuffer(doc)) as unknown as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="Employee benefits (NBEAC Form 7).docx"` } });
}

/**
 * POST { action, ... }
 *   plan { id?, kind, name, provider, policyNo, coverage, limitAmount, dependants, premium, employerSharePct, employeeSharePct, eligibility, renewalDate, active }
 *   enrol { planId, userId | "ALL", dependantsCount, amount, startDate }   unenrol { enrolmentId }
 *   claim { planId, date, amount, description } — a member of staff on their own plan;   decide { claimId, status, note }
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "claim") {
      const p = (await rdb.benefitPlan.findUnique({ where: { id: String(b.planId || "") } })) as Plan | null;
      const enrolled = p && (await rdb.benefitEnrolment.findFirst({ where: { planId: p.id, userId: w.id, endDate: null } }));
      if (!p || p.chairmanId !== w.chairmanId || !enrolled) return NextResponse.json({ error: "You are not enrolled in this plan." }, { status: 403 });
      const amount = num(b.amount), description = str(b.description, 1000);
      if (!amount || amount <= 0 || !description) return NextResponse.json({ error: "Give the amount and what it is for." }, { status: 400 });
      await rdb.benefitClaim.create({ data: { id: randomUUID(), planId: p.id, userId: w.id, date: dateOrNull(b.date) || new Date(), amount, description } });
      const fin = (await staffOf(w.chairmanId)).filter((s) => s.role === "FINANCE_OFFICER").map((s) => s.id);
      await notifyUsers(fin.length ? fin : [w.chairmanId], { kind: "BENEFITS", title: `${w.name} sent a ${KINDS[p.kind]?.toLowerCase() || "benefit"} claim of Rs ${amount.toLocaleString("en-PK")}`, href: "/benefits", exceptId: w.id });
      return NextResponse.json({ ok: true });
    }
    if (!canManageBenefits(w)) return NextResponse.json({ error: "Only the Finance Officer or the institute head manages benefits." }, { status: 403 });
    if (b.action === "plan") {
      const name = str(b.name, 160);
      if (!name) return NextResponse.json({ error: "Give the plan's name." }, { status: 400 });
      const data = { kind: KINDS[String(b.kind)] ? String(b.kind) : "OTHER", name, provider: str(b.provider, 160) || null, policyNo: str(b.policyNo, 80) || null, coverage: str(b.coverage, 2000) || null, limitAmount: num(b.limitAmount), dependants: str(b.dependants, 160) || null, premium: num(b.premium), employerSharePct: num(b.employerSharePct), employeeSharePct: num(b.employeeSharePct), eligibility: str(b.eligibility, 300) || null, renewalDate: dateOrNull(b.renewalDate), active: b.active === undefined ? true : !!b.active };
      if (b.id) { const cur = await rdb.benefitPlan.findUnique({ where: { id: String(b.id) } }); if (!cur || cur.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 }); await rdb.benefitPlan.update({ where: { id: cur.id }, data }); }
      else await rdb.benefitPlan.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, ...data } });
      await writeAuditLog({ actorUserId: w.id, action: "BENEFIT_PLAN_SAVED", entityType: "BenefitPlan", entityId: String(b.id || name), metadata: {} });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "enrol") {
      const p = (await rdb.benefitPlan.findUnique({ where: { id: String(b.planId || "") } })) as Plan | null;
      if (!p || p.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
      const staff = await staffOf(w.chairmanId);
      const who = b.userId === "ALL" ? staff.filter((s) => !["SUPER_USER"].includes(s.role)) : staff.filter((s) => s.id === String(b.userId || ""));
      if (!who.length) return NextResponse.json({ error: "Choose a member of staff (or everyone)." }, { status: 400 });
      for (const s of who) await rdb.benefitEnrolment.upsert({ where: { planId_userId: { planId: p.id, userId: s.id } }, create: { id: randomUUID(), planId: p.id, userId: s.id, dependantsCount: num(b.dependantsCount), amount: num(b.amount), startDate: dateOrNull(b.startDate) || new Date() }, update: { dependantsCount: num(b.dependantsCount), amount: num(b.amount), endDate: null } });
      await writeAuditLog({ actorUserId: w.id, action: "BENEFIT_ENROLLED", entityType: "BenefitPlan", entityId: p.id, metadata: { people: who.length } });
      return NextResponse.json({ ok: true, enrolled: who.length });
    }
    if (b.action === "unenrol") { await rdb.benefitEnrolment.updateMany({ where: { id: String(b.enrolmentId || "") }, data: { endDate: new Date() } }); return NextResponse.json({ ok: true }); }
    if (b.action === "decide") {
      const c = await rdb.benefitClaim.findUnique({ where: { id: String(b.claimId || "") } });
      const p = c ? await rdb.benefitPlan.findUnique({ where: { id: c.planId } }) : null;
      if (!c || !p || p.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const status = CLAIM[String(b.status)] ? String(b.status) : c.status;
      await rdb.benefitClaim.update({ where: { id: c.id }, data: { status, note: str(b.note, 500) || c.note, decidedById: w.id, decidedAt: new Date() } });
      await notifyUsers([c.userId], { kind: "BENEFITS", title: `Your claim of Rs ${c.amount.toLocaleString("en-PK")}: ${CLAIM[status].toLowerCase()}`, href: "/benefits", exceptId: w.id });
      await writeAuditLog({ actorUserId: w.id, action: "BENEFIT_CLAIM_DECIDED", entityType: "BenefitClaim", entityId: c.id, metadata: { status } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? BEN_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
