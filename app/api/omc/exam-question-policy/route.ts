import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { qdb } from "../../../../lib/examQuestions";

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

// PUT { courseType, midtermMinQuestions, finalMinQuestions } — the OMC sets the minimum questions per paper (0 = no rule).
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (!COURSE_TYPES.includes(b.courseType)) return NextResponse.json({ error: "valid courseType is required" }, { status: 400 });
  const mid = parseInt(b.midtermMinQuestions, 10), fin = parseInt(b.finalMinQuestions, 10);
  if ([mid, fin].some((v) => isNaN(v) || v < 0 || v > 50)) return NextResponse.json({ error: "Give a number of questions from 0 to 50 (0 = no rule)." }, { status: 400 });
  try {
    await qdb.examQuestionPolicy.upsert({
      where: { chairmanId_courseType: { chairmanId: user.managedById, courseType: b.courseType } },
      update: { midtermMinQuestions: mid, finalMinQuestions: fin, updatedById: user.id },
      create: { chairmanId: user.managedById, courseType: b.courseType, midtermMinQuestions: mid, finalMinQuestions: fin, updatedById: user.id },
    });
  } catch {
    return NextResponse.json({ error: "The exam question table is not in the database yet — run prisma/migration_exam_question_policy.sql (or the System Health fix script) in Supabase." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "EXAM_QUESTION_POLICY_SET", entityType: "WeightPolicy", entityId: b.courseType, metadata: { midtermMinQuestions: mid, finalMinQuestions: fin } });
  return NextResponse.json({ ok: true });
}
