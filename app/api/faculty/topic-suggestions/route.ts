import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { createSuggestion, suggestionsFor } from "../../../../lib/topicSuggestions";
import { WORKSPACE_ROLES } from "../../../../lib/facultyTopicWorkspace";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await suggestionsFor(user));
}

// Suggest a topic to a course you do not teach; its Subject Expert and Instructor are told.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !WORKSPACE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await createSuggestion(user, { fromCourseId: b.fromCourseId ? String(b.fromCourseId) : null, toCourseId: String(b.toCourseId || ""), topic: String(b.topic || ""), subtopic: b.subtopic ? String(b.subtopic) : null, note: b.note ? String(b.note) : null });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_SUGGESTED", entityType: "Course", entityId: r.suggestion.toCourseId, metadata: { topic: r.suggestion.topic } });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "The topic suggestion table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase." }, { status: 500 });
  }
}
