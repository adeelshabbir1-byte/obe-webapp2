import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { loadSession, sessionDays, parse, invigilatorPool } from "../../../../../lib/exams";
import { ebdb, examChairman } from "../../../../../lib/examBranch";
import { chairmanIdFor } from "../../../../../lib/reportScope";

// Program Leads list which of their staff are available for duties; the exam branch can add anyone;
// every teacher gives the slots they prefer and the most duties a day they want.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== (await chairmanIdFor(user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const branch = (await examChairman(user)) === s.chairmanId;
  try {
    if (b.action === "pool") {
      const target = await prisma.user.findUnique({ where: { id: String(b.userId || "") }, select: { id: true, managedById: true } });
      const own = target && user.role === "PROGRAM_COORDINATOR" && target.managedById === user.id;
      const inInst = target && (await invigilatorPool(s.chairmanId)).some((u) => u.id === target.id);
      if (!target || !(own || (branch && inInst) || (["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"].includes(user.role) && inInst))) return NextResponse.json({ error: "You can list only your own staff." }, { status: 403 });
      if (b.on) await ebdb.examDutyPool.upsert({ where: { sessionId_userId: { sessionId: s.id, userId: target.id } }, create: { sessionId: s.id, userId: target.id, addedById: user.id }, update: {} });
      else await ebdb.examDutyPool.deleteMany({ where: { sessionId: s.id, userId: target.id } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "pref") {
      const days = (await sessionDays(s)).map((d) => d.toISOString().slice(0, 10));
      const nSlots = parse<string[]>(s.slotsJson, []).length;
      const ok = new Set(days.flatMap((d) => Array.from({ length: nSlots }, (_, i) => `${d}:${i}`)));
      const slots = (Array.isArray(b.slots) ? b.slots : []).filter((x: unknown) => typeof x === "string" && ok.has(x));
      const data = { slotsJson: JSON.stringify(slots), maxPerDay: Math.max(1, Math.min(4, Number(b.maxPerDay) || 1)), note: typeof b.note === "string" ? b.note.slice(0, 300) : null };
      await ebdb.examDutyPref.upsert({ where: { sessionId_userId: { sessionId: s.id, userId: user.id } }, create: { sessionId: s.id, userId: user.id, ...data }, update: data });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_exam_branch.sql first." }, { status: 500 }); }
}
