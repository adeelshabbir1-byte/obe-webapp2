import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { coordinatorIdsFor } from "../../../../lib/reportScope";
import { withErrors } from "../../../../lib/apiHandler";
import { resetOffering, resetPreview, resetsFor, restoreOffering } from "../../../../lib/semesterReset";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The Program Lead resets their programs' current offering; the Department Coordinator the whole department's.
async function scopeOf() {
  const user = await getAuthenticatedUser();
  if (!user || !["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(user.role)) return null;
  if (user.role === "PROGRAM_COORDINATOR") return { user, scope: { coordinatorIds: [user.id], label: user.name } };
  const ids = await coordinatorIdsFor(user);
  return { user, scope: { coordinatorIds: ids, label: "the department" } };
}

// GET — what a reset would remove (with counts), and earlier resets that can still be restored.
async function GET_handler() {
  const s = await scopeOf();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ preview: await resetPreview(s.scope), resets: await resetsFor(s.scope) });
}
// POST { confirm } — reset; POST { restore: id } — restore within 7 days.
async function POST_handler(req: NextRequest) {
  const s = await scopeOf();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = b.restore ? await restoreOffering(s.scope, s.user, String(b.restore)) : await resetOffering(s.scope, s.user, String(b.confirm || ""));
  const { status, ...rest } = r;
  return NextResponse.json(rest, { status });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
