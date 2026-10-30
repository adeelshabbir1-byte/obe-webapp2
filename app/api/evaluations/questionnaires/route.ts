import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { writeAuditLog } from "../../../../lib/audit";
import { canEditQuestionnaires, saveQuestion, reorder, saveSettings, QUESTIONNAIRE_HINT, type Kind } from "../../../../lib/questionnaires";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { action: "save", kind, question } | { action: "reorder", kind, keys } | { action: "settings", fromWeek, toWeek, minResponses }
// — the QEC In-charge (until named: the Institute Head or a Dean) keeps the feedback questionnaires.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId || !(await canEditQuestionnaires(user, chairmanId))) return NextResponse.json({ error: "Only the QEC In-charge (or, until one is named, the Institute Head or a Dean) sets the questionnaires." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const kind: Kind = b.kind === "COURSE" ? "COURSE" : "TEACHER";
  try {
    if (b.action === "save") {
      const q = b.question || {};
      const key = await saveQuestion(chairmanId, kind, { key: q.key ? String(q.key) : undefined, text: String(q.text || ""), group: String(q.group || ""), weight: Number(q.weight), order: q.order === undefined ? undefined : Number(q.order), retired: !!q.retired, fdpTopic: q.fdpTopic ? String(q.fdpTopic) : null }, user.id);
      await writeAuditLog({ actorUserId: user.id, action: q.key ? (q.retired ? "FEEDBACK_QUESTION_RETIRED" : "FEEDBACK_QUESTION_CHANGED") : "FEEDBACK_QUESTION_ADDED", entityType: "FeedbackQuestion", entityId: key, metadata: { kind, text: String(q.text || "").slice(0, 200), weight: Number(q.weight) || 0, group: String(q.group || "") } }).catch(() => null);
      return NextResponse.json({ ok: true, key });
    }
    if (b.action === "reorder") {
      await reorder(chairmanId, kind, (Array.isArray(b.keys) ? b.keys : []).map(String), user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "settings") {
      const wk = (v: unknown) => (v === null || v === "" || v === undefined ? null : Math.max(1, Math.min(20, Math.round(Number(v)))));
      const fromWeek = wk(b.fromWeek), toWeek = wk(b.toWeek);
      if (fromWeek !== null && toWeek !== null && toWeek < fromWeek) return NextResponse.json({ error: "The window must end on or after the week it starts." }, { status: 400 });
      await saveSettings(chairmanId, { fromWeek, toWeek, minResponses: Math.round(Number(b.minResponses) || 5) }, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "FEEDBACK_WINDOW_SET", entityType: "FeedbackSettings", entityId: chairmanId, metadata: { fromWeek: fromWeek ?? "", toWeek: toWeek ?? "", minResponses: Number(b.minResponses) || 5 } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? QUESTIONNAIRE_HINT : m.slice(0, 200) }, { status: /Write the question/.test(m) ? 400 : 503 });
  }
}
export const POST = withErrors(POST_handler);
