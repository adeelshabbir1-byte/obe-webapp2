import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { aasContext } from "../../../../lib/aasAccess";
import { AAS_HINT, saveDetail, sectionRows } from "../../../../lib/aas";
import { STUDENT_SELF, STAFF_SELF, checkValues, canonValues } from "../../../../lib/aasFields";
import { TEMPLATES, portalLists, savePortalList, studentExport, facultyExport, summary, portalWorkbook, courseCatalog, courseCatalogWorkbook, importPortalFile, logExport } from "../../../../lib/nceacPortal";
import { INVENTORY, GROUP_LABEL } from "../../../../lib/nceacInventory";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const safe = (s: string) => s.replace(/[^\w .()-]+/g, "").trim();
const file = (buf: ArrayBuffer | Buffer, name: string) => new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${safe(name)}.xlsx"` } });

/** GET ?file=students|faculty|courses|inventory&program=&batch=<id|all>&scope=program|all — a file in the NCEAC portal's format. */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const ctx = await aasContext(user, { program: q.get("program"), batch: q.get("batch") === "all" ? null : q.get("batch") });
  if (!ctx || !ctx.program) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const lists = await portalLists(ctx.chairmanId);
  const kind = q.get("file");
  if (kind === "inventory") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("NCEAC portal fields");
    ws.addRow(["Portal form / file", "Field", "Type", "Allowed values", "Required", "Group", "Source in OBEHUB / formula / where it is typed"]).font = { bold: true };
    for (const f of INVENTORY) ws.addRow([f.form, f.field, f.type, f.allowed || "", f.required ? "Yes" : "No", GROUP_LABEL[f.group], f.source]);
    [34, 40, 18, 40, 9, 26, 70].forEach((w, i) => { ws.getColumn(i + 1).width = w; ws.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" }; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return file(await wb.xlsx.writeBuffer(), "NCEAC portal field inventory");
  }
  if (kind === "courses") {
    const rows = await courseCatalog(ctx.chairmanId, ctx.program);
    await logExport({ chairmanId: ctx.chairmanId, kind: "courses", program: ctx.program, rows: rows.length, rejected: 0, byId: user.id });
    return file(await courseCatalogWorkbook(rows, ctx.program), `Courses Catalog - ${ctx.program}`);
  }
  if (kind === "students" || kind === "faculty") {
    const t = TEMPLATES[kind];
    const batch = q.get("batch") === "all" ? "all" : ctx.batchId;
    if (kind === "students" && !batch) return NextResponse.json({ error: "Choose a batch." }, { status: 400 });
    const rows = kind === "students" ? await studentExport(ctx, batch as string, lists) : await facultyExport(ctx, q.get("scope") === "all" ? "all" : "program", lists);
    // "Only rows the portal will accept" leaves out the rows with problems, so the upload goes through and the rest can follow.
    const keep = q.get("only") === "ready" ? rows.filter((r) => !r.issues.some((i) => i.severity === "reject")) : rows;
    const s = summary(rows);
    const bname = kind === "students" ? (batch === "all" ? "all batches" : ctx.batches.find((b) => b.id === batch)?.batchName || "") : q.get("scope") === "all" ? "all faculty" : "";
    await logExport({ chairmanId: ctx.chairmanId, kind, program: ctx.program, batchId: batch === "all" ? null : batch, batchName: bname, rows: keep.length, rejected: q.get("only") === "ready" ? 0 : s.rejected, byId: user.id });
    await writeAuditLog({ actorUserId: user.id, action: "NCEAC_FILE_EXPORTED", entityType: "NceacExportLog", entityId: ctx.program, metadata: { kind, rows: keep.length, rejected: s.rejected } });
    return file(await portalWorkbook(t, keep), `${t.file} - ${ctx.program}${bname ? ` ${bname}` : ""}`);
  }
  return NextResponse.json({ error: "Unknown file" }, { status: 400 });
}

/**
 * POST JSON
 *   { action: "detail", kind: "student"|"staff", id, program, ...values } — fix one person's NCEAC details
 *   { action: "list", key, values: string[] | null } — correct (or reset) one of the portal's dropdown lists
 *   { action: "remind", program } — tell the program's teachers whose rows the portal would reject
 * POST multipart { file, kind: "students"|"faculty", program, batch } — upload a filled file in the portal's format.
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (!(req.headers.get("content-type") || "").includes("application/json")) {
      const form = await req.formData();
      const ctx = await aasContext(user, { program: String(form.get("program") || ""), batch: String(form.get("batch") || "") });
      if (!ctx || !ctx.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const kind = String(form.get("kind")) === "faculty" ? "faculty" : "students";
      const f = form.get("file") as File | null;
      if (!f || !f.size) return NextResponse.json({ error: "Choose the filled file." }, { status: 400 });
      if (f.size > 10 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 10 MB." }, { status: 400 });
      const r = await importPortalFile(Buffer.from(await f.arrayBuffer()), TEMPLATES[kind], ctx, user.id, await portalLists(ctx.chairmanId));
      await writeAuditLog({ actorUserId: user.id, action: "NCEAC_FILE_IMPORTED", entityType: kind === "students" ? "StudentDetail" : "StaffDetail", entityId: ctx.program, metadata: { rows: r.saved } });
      return NextResponse.json({ ok: true, ...r });
    }
    const b = await req.json().catch(() => ({}));
    const ctx = await aasContext(user, { program: b.program ? String(b.program) : null, batch: b.batch ? String(b.batch) : null });
    if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const lists = await portalLists(ctx.chairmanId);

    if (b.action === "detail") {
      if (!ctx.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const kind = b.kind === "staff" ? "staff" : "student";
      const id = String(b.id || "");
      if (kind === "student") {
        const s = await prisma.student.findUnique({ where: { id }, select: { batchId: true } });
        const mine = s && (await prisma.batch.findFirst({ where: { id: s.batchId, coordinator: { managedById: ctx.chairmanId }, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) }, select: { id: true } }));
        if (!mine) return NextResponse.json({ error: "This student is not in your programs." }, { status: 403 });
      } else {
        const staff = await sectionRows("faculty", ctx);
        if (!staff.some((r) => r.ref === id)) return NextResponse.json({ error: "This teacher is not on your faculty list." }, { status: 403 });
      }
      const keys = kind === "student" ? STUDENT_SELF : STAFF_SELF;
      // Only the fields that were sent change; the rest of the person's details stay as they are.
      const v = canonValues(kind, Object.fromEntries(keys.filter((k) => typeof b[k] === "string").map((k) => [k, b[k] as string])), lists);
      const bad = checkValues(kind, v, lists);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      await saveDetail(kind, id, v, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "NCEAC_DETAILS_FIXED", entityType: kind === "student" ? "StudentDetail" : "StaffDetail", entityId: id, metadata: { fields: Object.keys(v).filter((k) => v[k]).length } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "list") {
      if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "Only the institute head, Dean or HOD can change the portal lists." }, { status: 403 });
      const values = Array.isArray(b.values) ? b.values.map(String) : null;
      if (values && !values.filter((x: string) => x.trim()).length) return NextResponse.json({ error: "A list needs at least one value." }, { status: 400 });
      await savePortalList(ctx.chairmanId, String(b.key || ""), values, user.id);
      await writeAuditLog({ actorUserId: user.id, action: values ? "NCEAC_LIST_CHANGED" : "NCEAC_LIST_RESET", entityType: "AasRecord", entityId: String(b.key || ""), metadata: { values: values ? values.length : 0 } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remind") {
      if (!ctx.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const rows = await facultyExport(ctx, "program", lists);
      const ids = rows.filter((r) => r.issues.some((i) => i.severity === "reject")).map((r) => r.id);
      for (const r of rows.filter((x) => ids.includes(x.id))) {
        const cols = Array.from(new Set(r.issues.filter((i) => i.severity === "reject").map((i) => i.col))).slice(0, 6).join(", ");
        await notifyUsers([r.id], { kind: "NCEAC_DETAILS", title: "Please complete your NCEAC details", body: `${ctx.program} goes to NCEAC soon. Still needed: ${cols}.`, href: "/faculty/profile", exceptId: user.id });
      }
      await writeAuditLog({ actorUserId: user.id, action: "NCEAC_REMINDERS_SENT", entityType: "StaffDetail", entityId: ctx.program, metadata: { teachers: ids.length } });
      return NextResponse.json({ ok: true, sent: ids.length });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? AAS_HINT : `Could not save: ${m.slice(0, 160)}` }, { status: 500 });
  }
}

