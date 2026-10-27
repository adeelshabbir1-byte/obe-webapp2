import { NextRequest, NextResponse } from "next/server";
import { loadWorkspace, saveWorkspace } from "../../../../lib/facultyTopicWorkspace";
import { getState, loadColumns, savePlans, tablesReady, MISSING } from "../../../../lib/topicPlan";
import { forbidden, parseOpen, reply, wsUser } from "../../../../lib/topicApi";

export const maxDuration = 60;

// GET ?open=[{courseId, plan}] → the open courses' plans (any course of the institute, any number). Without `open`, the
// person's last set of open courses. (The older ?courseIds=&referenceIds= form still answers.)
export async function GET(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  if (sp.has("courseIds")) {
    const ids = (s: string | null) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
    const r = await loadWorkspace(user, ids(sp.get("courseIds")), ids(sp.get("referenceIds")));
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  const ready = await tablesReady();
  const state = ready ? await getState(user.id) : { open: [], draft: null, draftAt: null };
  const open = sp.has("open") ? parseOpen(sp.get("open")) : state.open;
  return NextResponse.json({ columns: await loadColumns(user, open), state, missing: ready ? null : MISSING });
}

// POST { sessionId, courses: [{courseId, plan, hash, entries}], note } → applies what the person owns, proposes the rest.
export async function POST(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  if (Array.isArray(b.courses) && b.courses.some((c: { items?: unknown }) => Array.isArray(c?.items))) {
    const r = await saveWorkspace(user, b.courses);
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  if (!Array.isArray(b.courses) || !b.courses.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  return reply(await savePlans(user, { sessionId: String(b.sessionId || "").slice(0, 80) || undefined, note: typeof b.note === "string" ? b.note : undefined, courses: b.courses }));
}
