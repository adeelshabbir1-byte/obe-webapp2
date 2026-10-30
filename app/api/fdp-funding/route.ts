import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, num, dateOrNull, staffOf } from "../../../lib/registers";
import { FDP_HINT, KINDS, SPONSORS, STATUS, canManageFdp, total, bond, spending, type Funding } from "../../../lib/fdpFunding";
import { withErrors } from "../../../lib/apiHandler";

/** GET — spending by fiscal year and every record (Excel), for the councils' faculty development tables. */
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !(canManageFdp(w) || w.qec)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = (await rdb.fdpFunding.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { sanctionedAt: "desc" } }).catch(() => [])) as Funding[];
  const staff = await staffOf(w.chairmanId);
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("By fiscal year");
  s.addRow(["Fiscal year", ...Object.values(KINDS), ...Object.values(SPONSORS).map((x) => `Paid by ${x}`), "Total (PKR)"]).font = { bold: true };
  for (const [fy, r] of spending(rows)) s.addRow([fy, ...Object.keys(KINDS).map((k) => r[k] || 0), ...Object.keys(SPONSORS).map((k) => r[`sp_${k}`] || 0), r.all || 0]);
  const d = wb.addWorksheet("Records");
  d.addRow(["Teacher", "Kind", "Purpose", "Place", "Sponsor", "Fee", "Stipend", "Travel", "Other", "Total", "Sanctioned", "Start", "Expected return", "Returned", "Bond (years)", "Status", "Refund due", "Refund paid"]).font = { bold: true };
  for (const f of rows) d.addRow([staff.find((x) => x.id === f.userId)?.name || "", KINDS[f.kind], f.purpose, [f.place, f.country].filter(Boolean).join(", "), f.sponsorName || SPONSORS[f.sponsor], f.feeAmount, f.stipendAmount, f.travelAmount, f.otherAmount, total(f), f.sanctionedAt, f.startDate, f.expectedReturn, f.actualReturn, f.bondYears, STATUS[f.status], f.refundDue ?? "", f.refundPaid ?? ""]);
  [s, d].forEach((ws) => ws.columns.forEach((c) => { c.width = 16; }));
  return new NextResponse((await wb.xlsx.writeBuffer()) as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Faculty development funding.xlsx"` } });
}

/**
 * POST { action, ... }
 *   add { userId, kind, sponsor, sponsorName, purpose, place, country, feeAmount, stipendAmount, travelAmount, otherAmount, sanctionedAt, startDate, expectedReturn, bondYears, notes }
 *   status { id, status, actualReturn, leftOn, refundPaid, notes } — head, Dean, HOD or Finance Officer
 *   report { id, term, report } — the funded teacher's progress report;   review { reportId, reviewNote }
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "report") {
      const f = (await rdb.fdpFunding.findUnique({ where: { id: String(b.id || "") } })) as Funding | null;
      if (!f || f.chairmanId !== w.chairmanId || f.userId !== w.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const term = str(b.term, 40), report = str(b.report, 6000);
      if (!term || !report) return NextResponse.json({ error: "Give the semester and the report." }, { status: 400 });
      await rdb.fdpProgress.create({ data: { id: randomUUID(), fundingId: f.id, term, report, submittedById: w.id } });
      const heads = (await staffOf(w.chairmanId)).filter((s) => ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(s.role)).map((s) => s.id);
      await notifyUsers(heads, { kind: "FDP_FUNDING", title: `${w.name} sent a progress report (${term})`, href: "/fdp-funding", exceptId: w.id });
      return NextResponse.json({ ok: true });
    }
    if (!canManageFdp(w)) return NextResponse.json({ error: "Only the institute head, Dean, HOD or Finance Officer manages funding." }, { status: 403 });
    if (b.action === "add") {
      const u = (await staffOf(w.chairmanId)).find((s) => s.id === String(b.userId || ""));
      const purpose = str(b.purpose, 200);
      if (!u || !purpose) return NextResponse.json({ error: "Choose the teacher and give the purpose (degree or event)." }, { status: 400 });
      const kind = KINDS[String(b.kind)] ? String(b.kind) : "TRAINING";
      const id = randomUUID();
      await rdb.fdpFunding.create({ data: { id, chairmanId: w.chairmanId, userId: u.id, kind, sponsor: SPONSORS[String(b.sponsor)] ? String(b.sponsor) : "INSTITUTE", sponsorName: str(b.sponsorName, 120) || null, purpose, place: str(b.place, 160) || null, country: str(b.country, 80) || null, feeAmount: num(b.feeAmount) || 0, stipendAmount: num(b.stipendAmount) || 0, travelAmount: num(b.travelAmount) || 0, otherAmount: num(b.otherAmount) || 0, sanctionedAt: dateOrNull(b.sanctionedAt), startDate: dateOrNull(b.startDate), expectedReturn: dateOrNull(b.expectedReturn), bondYears: ["STUDY_LEAVE", "SCHOLARSHIP"].includes(kind) ? num(b.bondYears) || 0 : 0, status: ["CONFERENCE", "TRAINING"].includes(kind) ? "COMPLETED" : "ACTIVE", notes: str(b.notes, 2000) || null, createdById: w.id } });
      await notifyUsers([u.id], { kind: "FDP_FUNDING", title: `Funding sanctioned: ${purpose}`, href: "/fdp-funding", exceptId: w.id });
      await writeAuditLog({ actorUserId: w.id, action: "FDP_FUNDING_ADDED", entityType: "FdpFunding", entityId: id, metadata: { kind } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "review") {
      const r = await rdb.fdpProgress.findUnique({ where: { id: String(b.reportId || "") } });
      const f = r ? await rdb.fdpFunding.findUnique({ where: { id: r.fundingId } }) : null;
      if (!r || !f || f.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 });
      await rdb.fdpProgress.update({ where: { id: r.id }, data: { reviewNote: str(b.reviewNote, 2000) || null, reviewedById: w.id } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "status") {
      const f = (await rdb.fdpFunding.findUnique({ where: { id: String(b.id || "") } })) as Funding | null;
      if (!f || f.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const status = STATUS[String(b.status)] ? String(b.status) : f.status;
      const actualReturn = dateOrNull(b.actualReturn) || f.actualReturn;
      let refundDue = f.refundDue;
      if (status === "BOND_BROKEN") { const left = dateOrNull(b.leftOn) || new Date(); refundDue = bond({ ...f, actualReturn }, left).refund ?? total(f); }
      if (status === "DISCONTINUED") refundDue = num(b.refundDue) ?? total(f);
      await rdb.fdpFunding.update({ where: { id: f.id }, data: { status, actualReturn, refundDue, refundPaid: num(b.refundPaid) ?? f.refundPaid, notes: str(b.notes, 2000) || f.notes, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: w.id, action: "FDP_FUNDING_STATUS", entityType: "FdpFunding", entityId: f.id, metadata: { status, refundDue } });
      return NextResponse.json({ ok: true, refundDue });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? FDP_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
