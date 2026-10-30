import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { departmentsOf } from "../../../lib/fyp";
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "../../../lib/evidenceFiles";
import { sarScope } from "../../../lib/sarAccess";
import { cleanValues, kindDef, missingRequired, sectionDef } from "../../../lib/sarRegistry";
import { withErrors } from "../../../lib/apiHandler";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Accreditation data: profile sections (institute / business school) and the records register.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const scope = await sarScope(user);
  if (!scope.chairmanId) return bad("forbidden", 403);
  const b = await req.json().catch(() => ({}));
  try {
    switch (String(b.action || "")) {
      case "saveSection": {
        const def = sectionDef(str(b.section, 40));
        const scopeKey = str(b.scopeKey, 60);
        if (!def || !scopeKey) return bad("unknown section");
        if (def.scope === "SCHOOL" && !(await prisma.department.findFirst({ where: { id: scopeKey, chairmanId: scope.chairmanId }, select: { id: true } }))) return bad("department not found", 404);
        if (!scope.canEditSection(def, scopeKey)) return bad("You can't change this section.", 403);
        const values = cleanValues(def.fields, b.values || {});
        // Read-modify-write of just this section, so people editing other sections don't overwrite each other.
        await prisma.$transaction(async (tx) => {
          const row = await tx.sarProfile.findUnique({ where: { chairmanId_scopeKey: { chairmanId: scope.chairmanId, scopeKey } } });
          let doc: Record<string, unknown> = {};
          try { doc = row ? JSON.parse(row.dataJson) : {}; } catch { doc = {}; }
          doc[def.key] = values;
          await tx.sarProfile.upsert({ where: { chairmanId_scopeKey: { chairmanId: scope.chairmanId, scopeKey } }, create: { chairmanId: scope.chairmanId, scopeKey, dataJson: JSON.stringify(doc), updatedById: user.id }, update: { dataJson: JSON.stringify(doc), updatedById: user.id } });
        });
        await writeAuditLog({ actorUserId: user.id, action: "SAR_SECTION_SAVED", entityType: "SarProfile", entityId: `${scopeKey}:${def.key}` });
        return NextResponse.json({ ok: true });
      }
      case "saveNarrative": {
        // The SAR builder's written answers: kept per business school under "narratives".
        const scopeKey = str(b.scopeKey, 60), code = str(b.code, 20);
        if (!/^[A-Z0-9.\-]+$/i.test(code)) return bad("unknown question");
        if (!(await prisma.department.findFirst({ where: { id: scopeKey, chairmanId: scope.chairmanId }, select: { id: true } }))) return bad("department not found", 404);
        if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role) || !scope.seesDept(scopeKey)) return bad("Only the Institute Head, the Dean or the department's Chairman writes the SAR answers.", 403);
        const text = typeof b.text === "string" ? b.text.slice(0, 20000) : "";
        await prisma.$transaction(async (tx) => {
          const row = await tx.sarProfile.findUnique({ where: { chairmanId_scopeKey: { chairmanId: scope.chairmanId, scopeKey } } });
          let doc: Record<string, Record<string, unknown>> = {};
          try { doc = row ? JSON.parse(row.dataJson) : {}; } catch { doc = {}; }
          doc.narratives = { ...(doc.narratives || {}), [code]: text };
          await tx.sarProfile.upsert({ where: { chairmanId_scopeKey: { chairmanId: scope.chairmanId, scopeKey } }, create: { chairmanId: scope.chairmanId, scopeKey, dataJson: JSON.stringify(doc), updatedById: user.id }, update: { dataJson: JSON.stringify(doc), updatedById: user.id } });
        });
        return NextResponse.json({ ok: true });
      }
      case "saveRecord": {
        const def = kindDef(str(b.kind, 40));
        if (!def) return bad("unknown record kind");
        const existing = b.id ? await prisma.accreditationRecord.findFirst({ where: { id: str(b.id, 60), chairmanId: scope.chairmanId, kind: def.kind } }) : null;
        if (b.id && !existing) return bad("not found", 404);
        const manager = scope.canEditKind(def);
        const granted = scope.grantedKindDepts(def);
        const own = scope.canSelfServe(def) && (!existing || existing.createdById === user.id);
        if (!manager && !own && !granted.length) return bad("You can't change these records.", 403);
        // Department: managers choose (institute-wide offices may leave it blank); faculty keeping their own records use their
        // department; someone holding an accreditation task only the task's department.
        let departmentId: string | null = str(b.departmentId, 60) || null;
        if (!manager && granted.length && !own) {
          departmentId = departmentId && granted.includes(departmentId) ? departmentId : granted[0];
          if (existing && (!existing.departmentId || !granted.includes(existing.departmentId))) return bad("Your accreditation task covers another department's records.", 403);
        } else if (!manager) departmentId = (await departmentsOf(user.id))[0] || null;
        else if (departmentId && !(scope.departments.some((d) => d.id === departmentId))) return bad("Choose one of your departments.", 403);
        else if (!departmentId && !scope.instituteWide) departmentId = scope.departments[0]?.id || null;
        if (existing && !scope.seesDept(existing.departmentId)) return bad("forbidden", 403);
        const title = str(b.title, 300);
        if (!title) return bad(`Enter the ${def.titleLabel.toLowerCase()}.`);
        if (def.titleOptions && !def.titleOptions.includes(title)) return bad(`Choose the ${def.titleLabel.toLowerCase()} from the list.`);
        const data = cleanValues(def.fields, b.data || {});
        const missing = missingRequired(def.fields, data);
        if (missing.length) return bad(`Fill in: ${missing.join(", ")}.`);
        const recordDate = def.dateLabel && /^\d{4}-\d{2}-\d{2}$/.test(str(b.recordDate, 10)) ? new Date(str(b.recordDate, 10) + "T00:00:00Z") : null;
        const year = def.yearLabel ? str(b.year, 30) || null : null;
        let file: { fileName: string | null; mimeType: string | null; fileData: string | null } | undefined;
        if (b.removeFile === true) file = { fileName: null, mimeType: null, fileData: null };
        if (b.file && def.file) {
          const name = str(b.file.name, 200), type = str(b.file.type, 120), base64 = typeof b.file.data === "string" ? b.file.data : "";
          if (!name || !ALLOWED_TYPES.includes(type)) return bad("Attach a PDF, Word, Excel, PowerPoint, image or text file.");
          if (Math.floor((base64.length * 3) / 4) > MAX_FILE_BYTES) return bad(`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
          file = { fileName: name, mimeType: type, fileData: base64 };
        }
        const payload = { departmentId, title, recordDate, year, dataJson: JSON.stringify(data), updatedById: user.id, ...(file || {}) };
        const row = existing
          ? await prisma.accreditationRecord.update({ where: { id: existing.id }, data: payload, select: { id: true } })
          : await prisma.accreditationRecord.create({ data: { chairmanId: scope.chairmanId, kind: def.kind, createdById: user.id, ...payload }, select: { id: true } });
        await writeAuditLog({ actorUserId: user.id, action: existing ? "SAR_RECORD_UPDATED" : "SAR_RECORD_ADDED", entityType: "AccreditationRecord", entityId: row.id, metadata: { kind: def.kind } });
        return NextResponse.json({ id: row.id });
      }
      case "deleteRecord": {
        const row = await prisma.accreditationRecord.findFirst({ where: { id: str(b.id, 60), chairmanId: scope.chairmanId } });
        const def = row ? kindDef(row.kind) : null;
        if (!row || !def || !scope.seesDept(row.departmentId)) return bad("not found", 404);
        const ownRow = row.createdById === user.id && (scope.canSelfServe(def) || (!!row.departmentId && scope.grantedKindDepts(def).includes(row.departmentId)));
        if (!scope.canEditKind(def) && !ownRow) return bad("You can't remove this record.", 403);
        await prisma.accreditationRecord.delete({ where: { id: row.id } });
        await writeAuditLog({ actorUserId: user.id, action: "SAR_RECORD_REMOVED", entityType: "AccreditationRecord", entityId: row.id, metadata: { kind: row.kind } });
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("The accreditation tables are not in the database yet — run prisma/migration_nbeac_sar.sql in Supabase.", 500);
    console.error("accreditation", msg);
    return bad("Could not save.", 500);
  }
}

// Download a record's attached file.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const scope = await sarScope(user);
  const row = await prisma.accreditationRecord.findFirst({ where: { id: req.nextUrl.searchParams.get("file") || "", chairmanId: scope.chairmanId } }).catch(() => null);
  const def = row ? kindDef(row.kind) : null;
  if (!row || !def || !row.fileData || !scope.seesDept(row.departmentId) || !(scope.canViewKind(def) || row.createdById === user.id)) return bad("not found", 404);
  if (def.confidential && !scope.canEditKind(def)) return bad("not found", 404);
  return new NextResponse(Buffer.from(row.fileData, "base64"), { headers: { "Content-Type": row.mimeType || "application/octet-stream", "Content-Disposition": `attachment; filename="${(row.fileName || "file").replace(/"/g, "")}"` } });
}
export const POST = withErrors(POST_handler);
export const GET = withErrors(GET_handler);
