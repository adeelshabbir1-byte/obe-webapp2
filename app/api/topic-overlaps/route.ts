import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { canEditLinks } from "../../../lib/topicLinks";
import { topicKeyOf } from "../../../lib/overlapMatrix";
import { withErrors } from "../../../lib/apiHandler";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const select = { id: true, code: true, coordinatorId: true, subjectExpertId: true } as const;

// Record whether a topic taught in two courses is an intentional progression or an accidental duplication (or clear it).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const coordinatorId = str(b.coordinatorId, 60);
  const [codeA, codeB] = [str(b.codeA, 40), str(b.codeB, 40)].sort();
  const topicA = str(b.topicA), topicB = str(b.topicB);
  if (!coordinatorId || !codeA || !codeB || codeA === codeB || !topicA || !topicB) return NextResponse.json({ error: "Missing the courses or topics." }, { status: 400 });
  const [a, d] = await Promise.all([
    prisma.course.findFirst({ where: { coordinatorId, code: codeA }, select }),
    prisma.course.findFirst({ where: { coordinatorId, code: codeB }, select }),
  ]);
  if (!a || !d) return NextResponse.json({ error: "course not found" }, { status: 404 });
  if (!(await canEditLinks(user, a, d))) return NextResponse.json({ error: "Only the Subject Expert of one of these courses, the Program Lead or the OMC can judge this overlap." }, { status: 403 });
  const topicKey = topicKeyOf(topicA, topicB);
  const where = { coordinatorId_codeA_codeB_topicKey: { coordinatorId, codeA, codeB, topicKey } };
  try {
    if (b.verdict !== "PROGRESSION" && b.verdict !== "DUPLICATION") {
      await prisma.topicOverlapReview.deleteMany({ where: { coordinatorId, codeA, codeB, topicKey } });
      return NextResponse.json({ ok: true });
    }
    const note = str(b.note, 500) || null;
    const row = await prisma.topicOverlapReview.upsert({ where, create: { coordinatorId, codeA, codeB, topicKey, topicA, topicB, verdict: b.verdict, note, byId: user.id }, update: { verdict: b.verdict, note, byId: user.id } });
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_OVERLAP_JUDGED", entityType: "TopicOverlapReview", entityId: row.id, metadata: { codeA, codeB, verdict: b.verdict } });
    return NextResponse.json({ review: row });
  } catch {
    return NextResponse.json({ error: "Run prisma/migration_master_spec.sql in Supabase first." }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
