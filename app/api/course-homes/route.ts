import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";
import { PdfDoc } from "../../../lib/pdfDoc";
import { catalogRows, confirmMatch, makeHomeBase, saveDraft, sendToBos, type Entry } from "../../../lib/courseHomes";

const db = prisma as unknown as Record<string, any>;
/**
 * POST { action, ... }
 *   save { draftId, changes: { key: { level, departmentId, program, track, chain, renumber } }, note }   send { draftId, committeeId }
 *   match { fromKey, toKey, reason }   chain { departmentId, chain, name }   programPrefix { program, departmentId, prefix }
 *   leadProgram { departmentId, program }   makeBase { groupId }
 * GET ?export=xlsx|pdf — the approved catalog (code, title, credit hours, prerequisites, home, category).
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const heads = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
  try {
    switch (b.action) {
      case "save": return NextResponse.json({ ok: true, draftId: await saveDraft(user, chairmanId, b.draftId || null, (b.changes || {}) as Record<string, Entry>, b.note) });
      case "send": { if (![...heads, "PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role)) throw new Error("Only the Dean, Institute Head / HOD or a Program Lead sends a draft to the BOS."); await sendToBos(user, chairmanId, String(b.draftId || ""), String(b.committeeId || "")); return NextResponse.json({ ok: true, message: "On the BOS agenda. Homes and codes change only when the BOS approves." }); }
      case "match": { if (![...heads, "OMC", "PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role)) throw new Error("Not allowed."); await confirmMatch(user, chairmanId, String(b.fromKey), String(b.toKey), String(b.reason || "")); return NextResponse.json({ ok: true }); }
      case "chain": {
        if (!heads.includes(user.role)) throw new Error("The department (HOD) or the Dean edits its chain table.");
        if (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId !== b.departmentId) throw new Error("Only your own department's chains.");
        const chain = Math.round(Number(b.chain)); if (!(chain >= 0 && chain <= 9)) throw new Error("A chain is 0–9.");
        const name = String(b.name || "").trim().slice(0, 80); if (!name) throw new Error("Name the chain.");
        await db.codeChain.upsert({ where: { chairmanId_departmentId_chain: { chairmanId, departmentId: String(b.departmentId), chain } }, create: { chairmanId, departmentId: String(b.departmentId), chain, name }, update: { name } });
        return NextResponse.json({ ok: true });
      }
      case "programPrefix": {
        if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new Error("The Chairman sets program prefixes.");
        const prefix = String(b.prefix || "").toUpperCase().replace(/[^A-Z]/g, "");
        if (prefix.length < 2 || prefix.length > 3) throw new Error("A prefix is 2–3 letters.");
        const all = (await db.courseCodeScheme.findMany({ where: { chairmanId } })) as { id: string; departmentId: string; program: string | null; prefix: string }[];
        const program = String(b.program || "");
        if (all.some((s) => s.prefix === prefix && (s.program || "").toLowerCase() !== program.toLowerCase())) throw new Error(`${prefix} is already used in the institute — prefixes must be unique.`);
        const own = all.find((s) => s.program && s.program.toLowerCase() === program.toLowerCase());
        const dept = String(b.departmentId || own?.departmentId || "");
        if (!dept) throw new Error("Choose the program's department.");
        if (own) await db.courseCodeScheme.update({ where: { id: own.id }, data: { prefix, setById: user.id, updatedAt: new Date() } });
        else await db.courseCodeScheme.create({ data: { id: randomUUID(), chairmanId, departmentId: dept, program, prefix, digits: 3, separator: "-", setById: user.id } });
        await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_PREFIX_SET", entityType: "Department", entityId: dept, metadata: { program, prefix } });
        return NextResponse.json({ ok: true });
      }
      case "leadProgram": {
        if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new Error("The Chairman sets the department's lead program.");
        await db.deptLeadProgram.upsert({ where: { chairmanId_departmentId: { chairmanId, departmentId: String(b.departmentId) } }, create: { chairmanId, departmentId: String(b.departmentId), program: String(b.program), setById: user.id }, update: { program: String(b.program), setById: user.id } });
        return NextResponse.json({ ok: true });
      }
      case "makeBase": return NextResponse.json({ ok: true, courseId: await makeHomeBase(user, chairmanId, String(b.groupId || "")) });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const rows = await catalogRows(chairmanId);
  const fmt = new URL(req.url).searchParams.get("export");
  if (fmt === "pdf") {
    const pdf = await PdfDoc.create("Approved course catalog");
    pdf.title("Approved course catalog", `${rows.length} courses · approved by the Board of Studies`);
    pdf.table([["Code", 60], ["Title", 170], ["CH", 25], ["Prerequisites", 110], ["Home", 110], ["Category", 70]], rows.map((r) => [r.code, r.title, r.creditHours, r.prerequisites, r.home, r.category]), { size: 7.5 });
    return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="course-catalog.pdf"' } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Catalog");
  ws.addRow(["Code", "Title", "Credit hours", "Prerequisites", "Home", "Category", "Old codes"]).font = { bold: true };
  for (const r of rows) ws.addRow([r.code, r.title, r.creditHours, r.prerequisites, r.home, r.category, r.aliases]);
  [12, 40, 12, 30, 34, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return new NextResponse(Buffer.from(await wb.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="course-catalog.xlsx"' } });
}
export const POST = withErrors(POST_handler);
export const GET = withErrors(GET_handler);
