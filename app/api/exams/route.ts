import { examChairman } from "../../../lib/examBranch";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { xdb, readSettings } from "../../../lib/exams";

// POST — the Institute Head opens an exam session (midterm / final) with its days, time slots and rules.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const cid = user ? await examChairman(user) : null;
  if (!user || !cid) return NextResponse.json({ error: "Only the exam branch manages exams." }, { status: 403 });
  const r = readSettings(await req.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const row = await xdb.examSession.create({ data: { ...r.data, chairmanId: cid, createdById: user.id } });
  await writeAuditLog({ actorUserId: user.id, action: "EXAM_SESSION_CREATED", entityType: "ExamSession", entityId: row.id, metadata: { name: r.data.name } });
  return NextResponse.json({ ok: true, id: row.id });
}
