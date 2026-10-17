import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { govScope, inScope } from "../../../../../lib/accreditation/governance";
import { buildSar } from "../../../../../lib/sarBuilder";
import { writeAuditLog } from "../../../../../lib/audit";

const db = prisma as unknown as Record<string, any>;
async function access(cycleId: string) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const s = await govScope(user);
  const c = await prisma.accreditationCycle.findUnique({ where: { id: cycleId } }).catch(() => null);
  if (!s || !c || !inScope(s, c)) return null;
  return { user, c, edit: s.canManage || c.leadId === user.id };
}

// GET: the full SAR as a Word document, generated now from live data plus the saved narrative.
export async function GET(_req: Request, { params }: { params: { cycleId: string } }) {
  const a = await access(params.cycleId);
  if (!a) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await buildSar(params.cycleId);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  await writeAuditLog({ actorUserId: a.user.id, action: "SAR_GENERATED", entityType: "AccreditationCycle", entityId: params.cycleId });
  return new NextResponse(r.buffer as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${r.filename}"` } });
}

// POST { sectionKey, text }: save the narrative for one chapter.
export async function POST(req: Request, { params }: { params: { cycleId: string } }) {
  const a = await access(params.cycleId);
  if (!a || !a.edit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const key = String(b.sectionKey || "").slice(0, 40), text = typeof b.text === "string" ? b.text.slice(0, 20000) : "";
  if (!key) return NextResponse.json({ error: "bad section" }, { status: 400 });
  try { await db.sarNarrative.upsert({ where: { cycleId_sectionKey: { cycleId: params.cycleId, sectionKey: key } }, create: { cycleId: params.cycleId, sectionKey: key, text, updatedById: a.user.id }, update: { text, updatedById: a.user.id } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Run prisma/migration_visit_extras.sql first." }, { status: 500 }); }
}
