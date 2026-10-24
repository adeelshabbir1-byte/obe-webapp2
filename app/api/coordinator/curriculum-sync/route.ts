import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { resolve } from "../../../../lib/curriculumSync";

// POST { batchId, courseIds[], take: "master" | "mine", all? } — the Program Lead decides each master change.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findUnique({ where: { id: String(b.batchId || "") }, select: { coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!batch || !(batch.coordinatorId === user.id || (["OMC", "CHAIRMAN"].includes(user.role) && (batch.coordinator.managedById === user.managedById || batch.coordinator.managedById === user.id)))) return NextResponse.json({ error: "Only the batch's Program Lead (or the OMC) can do this." }, { status: 403 });
  const ids: string[] = Array.isArray(b.courseIds) ? b.courseIds.map(String) : String(b.courseIds || "").split(",").filter(Boolean);
  try {
    const n = await resolve(user.id, String(b.batchId), ids, b.take === "mine" ? "mine" : "master", b.all === true);
    return NextResponse.json({ ok: true, message: b.take === "mine" ? "Kept as it is." : `${n} course(s) updated from the master.` });
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /courseMasterSync|does not exist/.test(m) ? "Needs prisma/migration_curriculum_builder.sql — run it in Supabase." : m }, { status: 400 }); }
}
