import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { aasContext } from "../../../../lib/aasAccess";
import { adb, AAS_HINT } from "../../../../lib/aas";
import { aasWorkbook, studentUploadFile, importAasWorkbook } from "../../../../lib/aasWorkbook";
import { writeAuditLog } from "../../../../lib/audit";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET ?file=workbook|students&program=&batch= — the AAS workbook, or the Student Directory in AAS upload format. */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const ctx = await aasContext(user, { program: q.get("program"), batch: q.get("batch") });
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const safe = (s: string) => s.replace(/[^\w .-]+/g, "");
  if (q.get("file") === "students") {
    const b = ctx.batches.find((x) => x.id === ctx.batchId);
    const buf = await studentUploadFile(ctx);
    return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${safe(`Student Directory - ${ctx.program} ${b?.batchName || ""}`)}.xlsx"` } });
  }
  const buf = await aasWorkbook(ctx);
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${safe(`NCEAC AAS - ${ctx.program || "institute"}`)}.xlsx"` } });
}

/** POST multipart { file, program, batch } — save what people filled in the AAS workbook. POST JSON { action: "focal", userId } — choose the focal person. */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      const ctx = await aasContext(user, {});
      if (!ctx || !["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const u = await prisma.user.findUnique({ where: { id: String(b.userId || "") }, select: { id: true } });
      if (!u) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
      await adb.aasRecord.upsert({ where: { chairmanId_scope_key: { chairmanId: ctx.chairmanId, scope: "settings", key: "focal" } }, create: { id: randomUUID(), chairmanId: ctx.chairmanId, scope: "settings", key: "focal", dataJson: JSON.stringify({ userId: u.id }), updatedById: user.id }, update: { dataJson: JSON.stringify({ userId: u.id }), updatedById: user.id, updatedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }
    const form = await req.formData();
    const ctx = await aasContext(user, { program: String(form.get("program") || ""), batch: String(form.get("batch") || "") });
    if (!ctx || !ctx.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const file = form.get("file") as File | null;
    if (!file || !file.size) return NextResponse.json({ error: "Choose the filled-in AAS workbook." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 10 MB." }, { status: 400 });
    const r = await importAasWorkbook(Buffer.from(await file.arrayBuffer()), ctx, user.id);
    if (!r.sheets) return NextResponse.json({ error: "No AAS sheets were found. Upload the workbook downloaded from this page." }, { status: 400 });
    await writeAuditLog({ actorUserId: user.id, action: "AAS_WORKBOOK_IMPORTED", entityType: "AasRecord", entityId: ctx.program || "institute", metadata: { rows: r.saved } });
    return NextResponse.json({ ok: true, saved: r.saved });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? AAS_HINT : `Could not read the file: ${m.slice(0, 160)}` }, { status: 500 });
  }
}
