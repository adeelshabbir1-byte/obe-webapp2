import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { ldb, LEAVE_MANAGERS, revokeCourses, type LeaveRow } from "../../../../../lib/facultyLeave";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { withErrors } from "../../../../../lib/apiHandler";

// POST { courseIds } — take these courses back from the teacher on leave (as Instructor and / or Subject Expert).
async function POST_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !LEAVE_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const l = (await ldb.facultyLeave.findUnique({ where: { id: params.id } })) as LeaveRow | null;
  if (!l || l.chairmanId !== (await chairmanIdFor(user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.courseIds) ? b.courseIds.map(String) : [];
  if (!ids.length) return NextResponse.json({ error: "Choose at least one course." }, { status: 400 });
  const n = await revokeCourses(l, ids, { id: user.id, name: user.name });
  return NextResponse.json({ ok: true, revoked: n });
}
export const POST = withErrors(POST_handler);
