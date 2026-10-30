import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { buildExcelResponse } from "../../../lib/excelExport";
import { VP_HINT, vdb, saveRule, setVisiting, saveBiometric, buildClaim, teacherUpdate, plDecide, deanDecide, markPaid, type Claim } from "../../../lib/visitingPay";
import { withErrors } from "../../../lib/apiHandler";

const s = (v: unknown, n = 500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const RULE_ROLES = ["DEAN", "CHAIRMAN"], FIN = ["FINANCE_OFFICER", "CHAIRMAN"];

// GET ?sheet=YYYY-MM — Accounts: the month's approved / paid visiting-pay sheet as Excel.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !FIN.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  const m = (req.nextUrl.searchParams.get("sheet") || new Date().toISOString().slice(0, 7)).match(/^(\d{4})-(\d{2})$/);
  const from = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(), to = m ? new Date(Number(m[1]), Number(m[2]), 0, 23, 59) : new Date();
  const cs = ((await vdb.visitingClaim.findMany({ where: { chairmanId, status: { in: ["DEAN_APPROVED", "PAID"] }, periodStart: { gte: from, lte: to } } })) as Claim[]);
  const users = await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.userId).concat("none") } }, select: { id: true, name: true, department_: { select: { name: true } } } });
  const courses = await prisma.course.findMany({ where: { id: { in: cs.map((c) => c.courseId).concat("none") } }, select: { id: true, code: true, title: true } });
  return buildExcelResponse(`visiting-pay-${m ? `${m[1]}-${m[2]}` : "month"}.xlsx`, [{ name: "Visiting pay", columns: [{ header: "Teacher", key: "t", width: 26 }, { header: "Department", key: "d", width: 22 }, { header: "Course", key: "c", width: 34 }, { header: "Lectures", key: "n", width: 10 }, { header: "Amount", key: "a", width: 12 }, { header: "Status", key: "st", width: 12 }, { header: "Paid ref", key: "r", width: 20 }],
    rows: cs.map((c) => { const u = users.find((x) => x.id === c.userId); const co = courses.find((x) => x.id === c.courseId); return { t: u?.name || "", d: u?.department_?.name || "", c: co ? `${co.code} ${co.title}` : "", n: (JSON.parse(c.linesJson) as { counted: boolean }[]).filter((l) => l.counted).length, a: c.adjustedAmount ?? c.amount, st: c.status === "PAID" ? "Paid" : "Approved", r: c.paidRef || "" }; }) }]);
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      if (!RULE_ROLES.includes(user.role) && user.role !== "FINANCE_OFFICER") throw new Error("The Dean / Institute Head / Accounts uploads biometric records.");
      const file = (await req.formData()).get("file") as File | null;
      if (!file) throw new Error("Choose the file.");
      const wb = new ExcelJS.Workbook();
      const buf = Buffer.from(await file.arrayBuffer());
      const grid: string[][] = [];
      if (/\.csv$/i.test(file.name)) buf.toString("utf8").split(/\r?\n/).forEach((l) => grid.push(l.split(/[,;\t]/).map((x) => x.trim())));
      else { await wb.xlsx.load(buf as never); wb.worksheets[0].eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = c.value instanceof Date ? c.value.toISOString().slice(0, 10) : (c.text || "").trim(); }); grid.push(cells); }); }
      const head = (grid.shift() || []).map((h) => (h || "").toLowerCase());
      const ix = (re: RegExp) => head.findIndex((h) => re.test(h));
      const iCode = ix(/code|cnic|employee|id/), iDate = ix(/date|day/), iIn = ix(/in/), iOut = ix(/out/);
      if (iCode < 0 || iDate < 0) throw new Error("The sheet needs columns: Employee code (or CNIC), Date, Time in, Time out.");
      const rows = grid.filter((r) => r[iCode]).map((r) => ({ code: r[iCode], date: r[iDate], inAt: iIn >= 0 ? r[iIn] : "", outAt: iOut >= 0 ? r[iOut] : "" }));
      return NextResponse.json({ ok: true, message: await saveBiometric(user, chairmanId, rows) });
    }
    const b = await req.json().catch(() => ({}));
    let message = "";
    switch (b.action) {
      case "rule": if (!RULE_ROLES.includes(user.role)) throw new Error("The Dean (or Institute Head) sets the rules."); message = await saveRule(user, chairmanId, b); break;
      case "visiting": {
        const c = await prisma.course.findFirst({ where: { id: s(b.courseId, 60), coordinatorId: user.id }, select: { id: true, instructorId: true } });
        if (!c || !c.instructorId) throw new Error("Only the course's Program Lead marks it, and the course needs a teacher.");
        message = await setVisiting(user, chairmanId, c.id, s(b.userId, 60) || c.instructorId, b.on !== false, s(b.note)); break;
      }
      case "build": {
        const a = await vdb.visitingAssignment.findFirst({ where: { id: s(b.assignmentId, 60), OR: [{ userId: user.id }, { chairmanId }] } });
        if (!a) throw new Error("Not found.");
        await buildClaim(a.id); message = "Claim refreshed from the lecture log, timetable and biometric records."; break;
      }
      case "teacher": {
        const reasons: Record<string, string> = {}, modes: Record<string, string> = {};
        for (const [k, v] of Object.entries(b)) { const m = k.match(/^(reason|mode)_(\d+)$/); if (m) (m[1] === "reason" ? reasons : modes)[m[2]] = String(v || ""); }
        message = await teacherUpdate(user, s(b.id, 60), { reasons, modes, note: s(b.note, 1000), send: b.send === true || b.send === "true" }); break;
      }
      case "pl": message = await plDecide(user, s(b.id, 60), { decision: b.decision === "HOLD" ? "HOLD" : "FORWARD", note: s(b.note || b.plNote, 1000), adjustedAmount: b.adjustedAmount === "" || b.adjustedAmount === undefined ? null : Number(b.adjustedAmount), uncount: String(b.uncount || "").split(/[,\s]+/).map(Number).filter((n) => n > 0) }); break;
      case "dean": if (!RULE_ROLES.includes(user.role)) throw new Error("The Dean approves."); message = await deanDecide(user, s(b.id, 60), b.approve !== false, s(b.note, 1000)); break;
      case "paid": if (!FIN.includes(user.role)) throw new Error("Accounts marks payments."); message = await markPaid(user, s(b.id, 60), s(b.ref || b.note, 120)); break;
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const m = (e as Error).message || "Failed.";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? VP_HINT : m }, { status: 400 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
