import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ldb = prisma as unknown as Record<string, any>;

// POST { key, score, total, passMark } — keeps each person's best score per lesson / course practice.
export async function POST(req: Request) {
  const user = await getSignedInUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const key = String(b.key || "").slice(0, 120), score = Math.max(0, Number(b.score) || 0), total = Math.max(1, Number(b.total) || 1);
  if (!/^(lesson|course):/.test(key)) return NextResponse.json({ error: "bad key" }, { status: 400 });
  const passed = score >= Math.min(total, Math.max(1, Number(b.passMark) || Math.ceil(total * 0.8)));
  try {
    const old = await ldb.obeProgress.findUnique({ where: { userId_key: { userId: user.id, key } } });
    if (!old || score > old.score) await ldb.obeProgress.upsert({ where: { userId_key: { userId: user.id, key } }, create: { userId: user.id, key, score, total, passed }, update: { score, total, passed: passed || old?.passed } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Learning progress is not set up yet (migration_obe_learning.sql)." }, { status: 500 }); }
}
