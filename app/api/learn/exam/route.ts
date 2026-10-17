import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../../lib/session";
import { tdb, BADGES, badgeOf, questionById, PASS_PCT, EXAM_MIN, RETAKE_MIN } from "../../../../lib/training";

type Att = { id: string; badge: string; idsJson: string; answersJson: string; startedAt: Date; submittedAt: Date | null; passed: boolean };

// Certification exam: start (random questions, options never sent with answers), submit (graded on the server).
export async function POST(req: Request) {
  const user = await getSignedInUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const badge = badgeOf(String(b.badge || ""));
  if (!badge) return NextResponse.json({ error: "Unknown certificate." }, { status: 400 });
  try {
    const open = (await tdb.trainingAttempt.findFirst({ where: { userId: user.id, badge: badge.key, submittedAt: null }, orderBy: { startedAt: "desc" } })) as Att | null;
    if (b.action === "start") {
      if (await tdb.trainingAttempt.count({ where: { userId: user.id, badge: badge.key, passed: true } })) return NextResponse.json({ error: "You already hold this badge." }, { status: 400 });
      if (open && Date.now() - open.startedAt.getTime() < EXAM_MIN * 60000) return NextResponse.json({ ok: true, id: open.id });
      const last = (await tdb.trainingAttempt.findFirst({ where: { userId: user.id, badge: badge.key, submittedAt: { not: null } }, orderBy: { submittedAt: "desc" } })) as Att | null;
      if (last?.submittedAt && Date.now() - last.submittedAt.getTime() < RETAKE_MIN * 60000) return NextResponse.json({ error: `You can retake ${RETAKE_MIN} minutes after your last attempt. Review the lessons meanwhile.` }, { status: 400 });
      const pool = badge.pool(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const a = await tdb.trainingAttempt.create({ data: { userId: user.id, badge: badge.key, idsJson: JSON.stringify(pool.slice(0, badge.count).map((x) => x.id)) } });
      return NextResponse.json({ ok: true, id: a.id });
    }
    if (b.action === "submit") {
      if (!open) return NextResponse.json({ error: "No exam in progress." }, { status: 400 });
      const ids = JSON.parse(open.idsJson) as string[];
      const ans = (b.answers || {}) as Record<string, number>;
      const late = Date.now() - open.startedAt.getTime() > (EXAM_MIN + 1) * 60000;
      const score = late ? 0 : ids.filter((id) => questionById(id)?.answer === ans[id]).length;
      const passed = !late && score * 100 >= ids.length * PASS_PCT;
      await tdb.trainingAttempt.update({ where: { id: open.id }, data: { answersJson: JSON.stringify(ans), submittedAt: new Date(), score, total: ids.length, passed } });
      return NextResponse.json({ ok: true, score, total: ids.length, passed, late, id: open.id });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Certification is not set up yet — run prisma/migration_training.sql." }, { status: 500 }); }
}
export const dynamic = "force-dynamic";
void BADGES;
