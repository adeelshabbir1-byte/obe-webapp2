import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { labAccessFor } from "../../../../lib/labAccess";
import { carryForward } from "../../../../lib/labCarry";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// POST { courseId } — copy passed lab marks of repeaters (Adeel prompt §31.5).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const b = (await req.json().catch(() => ({}))) as { courseId?: string };
  const access = user ? await labAccessFor(user, String(b.courseId || "")) : null;
  if (!user || !access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ ok: true, students: await carryForward(access.lab.id, user.id) }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
