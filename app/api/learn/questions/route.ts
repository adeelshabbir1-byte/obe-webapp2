import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

const ldb = prisma as unknown as Record<string, any>;
const QUESTION_EDITORS = ["OMC", "CHAIRMAN", "SUPER_USER"];

// POST add a practice question; DELETE ?id= remove one. The Super User's questions are for every institute.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !QUESTION_EDITORS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const options = (Array.isArray(b.options) ? b.options : []).map((x: unknown) => String(x || "").trim()).filter(Boolean).slice(0, 6);
  const answer = Number(b.answer);
  if (!String(b.prompt || "").trim() || options.length < 2 || !(answer >= 0 && answer < options.length)) return NextResponse.json({ error: "Write the question, at least two options and mark the right one." }, { status: 400 });
  if (!b.masterCourseId) return NextResponse.json({ error: "Choose the course." }, { status: 400 });
  const chairmanId = user.role === "SUPER_USER" ? null : await chairmanIdFor(user);
  try {
    await ldb.obeQuestion.create({ data: { chairmanId, masterCourseId: String(b.masterCourseId), prompt: String(b.prompt).trim().slice(0, 2000), optionsJson: JSON.stringify(options), answer, explanation: String(b.explanation || "").trim().slice(0, 2000) || null, createdById: user.id } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "The question bank is not set up yet (migration_obe_learning.sql)." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !QUESTION_EDITORS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const chairmanId = user.role === "SUPER_USER" ? null : await chairmanIdFor(user);
  await ldb.obeQuestion.deleteMany({ where: { id, chairmanId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
