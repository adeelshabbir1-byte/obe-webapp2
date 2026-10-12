import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { appraiseesFor } from "../../../../lib/appraisal";
import { rdb2, currentSemester, RECOGNITION_MANAGERS } from "../../../../lib/recognition";

// POST { userId, title, reason } — the Chairman / Institute Head recognises work the system can't see
// (a workshop run, committee work, a research grant...). DELETE ?id= takes one back.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !RECOGNITION_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { chairmanId, people } = await appraiseesFor(user);
  if (!people.some((p) => p.id === b.userId)) return NextResponse.json({ error: "Choose a teacher in your area." }, { status: 400 });
  const title = String(b.title || "").trim().slice(0, 80);
  if (title.length < 3) return NextResponse.json({ error: "Name the recognition, e.g. Workshop Leader." }, { status: 400 });
  const sem = await currentSemester(chairmanId);
  if (!sem) return NextResponse.json({ error: "The current term is not set yet." }, { status: 400 });
  await rdb2.recognitionBadge.upsert({
    where: { userId_term_badgeKey_title: { userId: String(b.userId), term: sem.label, badgeKey: "CUSTOM", title } },
    update: { reason: b.reason ? String(b.reason).slice(0, 500) : null, awardedById: user.id },
    create: { chairmanId, userId: String(b.userId), term: sem.label, badgeKey: "CUSTOM", title, reason: b.reason ? String(b.reason).slice(0, 500) : null, awardedById: user.id },
  });
  await writeAuditLog({ actorUserId: user.id, action: "RECOGNITION_GIVEN", entityType: "User", entityId: String(b.userId), metadata: { title, term: sem.label } });
  await notifyUsers([String(b.userId)], { kind: "REQUEST", title: `Recognised: ${title}`, body: `${user.name} recognised you${b.reason ? ` — ${String(b.reason).slice(0, 200)}` : "."}`, href: "/my-obe" });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !RECOGNITION_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { chairmanId, people } = await appraiseesFor(user);
  await rdb2.recognitionBadge.deleteMany({ where: { id: req.nextUrl.searchParams.get("id") || "", chairmanId, userId: { in: people.map((p) => p.id) } } });
  return NextResponse.json({ ok: true });
}
