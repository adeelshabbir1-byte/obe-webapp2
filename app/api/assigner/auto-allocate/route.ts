import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { applyAllocation, suggestAllocation } from "../../../../lib/autoAllocate";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 60;

// GET ?keep=1|0 — the suggested allocation. POST { keys: string[], keepExisting } — apply the chosen lines.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const keep = req.nextUrl.searchParams.get("keep") !== "0";
  try { return NextResponse.json(await suggestAllocation(user, { keepExisting: keep })); }
  catch (e) { console.error("auto-allocate", e); return NextResponse.json({ error: "Could not work out a suggestion." }, { status: 500 }); }
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const keys = Array.isArray(b.keys) ? b.keys.map(String) : [];
  if (!keys.length) return NextResponse.json({ error: "Choose at least one line." }, { status: 400 });
  const applied = await applyAllocation(user, keys, b.keepExisting !== false);
  return NextResponse.json({ applied });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
