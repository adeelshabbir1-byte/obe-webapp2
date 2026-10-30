import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { govScope, inScope, openCycle } from "../../../../lib/accreditation/governance";
import { withErrors } from "../../../../lib/apiHandler";

const MISSING = "Accreditation governance needs prisma/migration_accreditation_governance.sql to be run in Supabase first.";
const dateOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);

// POST { leadId, title?, visitDate? } — plan an accreditation visit for a program (Institute Head, Dean, Chairman).
// Its council's requirements become tasks, ready to assign.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  if (!user || !s?.canManage) return NextResponse.json({ error: "Only the Institute Head, a Dean or a Chairman plans visits." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await openCycle(s, user.id, String(b.leadId || ""), { title: String(b.title || "").slice(0, 160), visitDate: dateOf(b.visitDate) });
    if ("error" in r) return NextResponse.json(r, { status: r.id ? 409 : 400 });
    await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_VISIT_PLANNED", entityType: "AccreditationCycle", entityId: r.id, metadata: { body: r.body } });
    return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// PATCH { id, title?, visitDate?, status? } — rename, re-date, close or reopen a visit.
async function PATCH_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  if (!user || !s?.canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const c = await prisma.accreditationCycle.findUnique({ where: { id: String(b.id || "") } });
    if (!c || !inScope(s, c)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const data: { title?: string; visitDate?: Date | null; status?: string } = {};
    if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 160);
    if (b.visitDate !== undefined) data.visitDate = dateOf(b.visitDate);
    if (b.status === "CLOSED" || b.status === "OPEN") {
      if (b.status === "OPEN" && c.status !== "OPEN" && (await prisma.accreditationCycle.findFirst({ where: { leadId: c.leadId, status: "OPEN", body: c.body, NOT: { id: c.id } } }))) return NextResponse.json({ error: "Another visit is open for this program." }, { status: 409 });
      data.status = b.status;
    }
    await prisma.accreditationCycle.update({ where: { id: c.id }, data });
    await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_VISIT_UPDATED", entityType: "AccreditationCycle", entityId: c.id, metadata: { title: data.title, status: data.status, visitDate: data.visitDate === undefined ? undefined : data.visitDate ? data.visitDate.toISOString().slice(0, 10) : null } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
export const POST = withErrors(POST_handler);
export const PATCH = withErrors(PATCH_handler);
