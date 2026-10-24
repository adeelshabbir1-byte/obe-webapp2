import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { act, startCurriculum, BUILDER_HINT } from "../../../lib/curriculumBuilder";

// POST { action: "start", program, council, version, templateKey?, sourceId? } → { id }
// POST { id, action: place | updateCourse | addCourse | removeCourse | saveTypes | applyTemplate | autoPlace | track |
//        addTrack | editTrack | removeTrack | submit | publish | reopen, ... }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Please sign in again." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "start") {
      const id = await startCurriculum(user, { program: String(b.program || ""), council: String(b.council || "HEC"), version: String(b.version || ""), templateKey: b.templateKey ? String(b.templateKey) : undefined, sourceId: b.sourceId ? String(b.sourceId) : undefined });
      return NextResponse.json({ ok: true, id });
    }
    const message = await act(user, String(b.id || ""), b);
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /curriculumType|curriculumTrack|masterCourseTrack|curriculumBuilderScope|does not exist/.test(m) ? BUILDER_HINT : m }, { status: 400 });
  }
}
