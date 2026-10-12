import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { appraiseesFor } from "../../../../lib/appraisal";
import { rdb2, teacherSemester, currentSemester, BADGES, RECOGNITION_MANAGERS } from "../../../../lib/recognition";

export const maxDuration = 300;

// POST — give this semester's automatic badges to everyone in the area who has earned them (safe to run again:
// a badge already given is not given twice). Usually pressed at the end of the semester.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || !RECOGNITION_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { chairmanId, people } = await appraiseesFor(user);
  const sem = await currentSemester(chairmanId);
  if (!sem) return NextResponse.json({ error: "The current term is not set yet." }, { status: 400 });
  let given = 0;
  for (const p of people) {
    const t = await teacherSemester(p.id, chairmanId).catch(() => null);
    if (!t) continue;
    const got: string[] = [];
    for (const e of t.earned.filter((x) => x.met)) {
      const exists = await rdb2.recognitionBadge.findFirst({ where: { userId: p.id, term: sem.label, badgeKey: e.key } });
      if (exists) continue;
      await rdb2.recognitionBadge.create({ data: { chairmanId, userId: p.id, term: sem.label, badgeKey: e.key, title: BADGES[e.key].title, reason: e.why } });
      got.push(BADGES[e.key].title); given++;
    }
    if (got.length) await notifyUsers([p.id], { kind: "REQUEST", title: `${sem.label}: you earned ${got.join(", ")}`, body: "Well done — see your recognition on My OBE Progress.", href: "/my-obe" });
  }
  await writeAuditLog({ actorUserId: user.id, action: "RECOGNITION_SEMESTER_AWARDED", entityType: "User", entityId: user.id, metadata: { term: sem.label, given } });
  return NextResponse.json({ ok: true, given });
}
