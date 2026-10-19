import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addQuestion, BLOOMS, markUsed, removeQuestion, QB_HINT } from "../../../lib/questionBank";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
// POST { action: "add", courseCode, cloCode, bloom, kind, marks, text } | { action: "remove", id } | { action: "used", ids }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["INSTRUCTOR", "SUBJECT_EXPERT", "OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "add") {
      const text = str(b.text, 5000), marks = Number(b.marks);
      if (text.length < 5 || !Number.isFinite(marks) || marks <= 0 || marks > 100) return NextResponse.json({ error: "Write the question and its marks." }, { status: 400 });
      await addQuestion(chairmanId, { courseCode: str(b.courseCode, 30), cloCode: str(b.cloCode, 20) || "CLO-1", bloom: BLOOMS.includes(b.bloom) ? b.bloom : "C2", kind: ["SHORT", "LONG", "PROBLEM"].includes(b.kind) ? b.kind : "SHORT", marks, text, createdById: user.id });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") { await removeQuestion(chairmanId, str(b.id, 60)); return NextResponse.json({ ok: true }); }
    if (b.action === "used") { await markUsed((Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 100)); return NextResponse.json({ ok: true }); }
  } catch { return NextResponse.json({ error: QB_HINT }, { status: 500 }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
