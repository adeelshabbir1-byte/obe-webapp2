import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { applyAllocation, suggestAllocation } from "../../../../lib/autoAllocate";

export const maxDuration = 60;

// GET ?keep=1|0 — the suggested allocation. POST { keys: string[], keepExisting } — apply the chosen lines.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const keep = req.nextUrl.searchParams.get("keep") !== "0";
  try { return NextResponse.json(await suggestAllocation(user, { keepExisting: keep })); }
  catch (e) { console.error("auto-allocate", e); return NextResponse.json({ error: "Could not work out a suggestion." }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const keys = Array.isArray(b.keys) ? b.keys.map(String) : [];
  if (!keys.length) return NextResponse.json({ error: "Choose at least one line." }, { status: 400 });
  const applied = await applyAllocation(user, keys, b.keepExisting !== false);
  return NextResponse.json({ applied });
}
