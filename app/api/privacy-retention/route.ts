import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { applyRetention, getRetention, retentionPreview, setRetention } from "../../../lib/retention";

export const dynamic = "force-dynamic";
const num = (v: unknown, max: number) => (v === null || v === "" || v === undefined ? null : Math.max(1, Math.min(max, Math.round(Number(v)) || 0)) || null);

// GET ?chairmanId= — the institute's retention setting and what it would remove now.
// POST { chairmanId, inactiveUserMonths, graduatedDetailYears } — set it (Institute Head for their own; Super Admin).
// POST { chairmanId, apply: true, confirm: "REMOVE" } — Super Admin only: remove what the preview shows.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["SUPER_USER", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = user.role === "CHAIRMAN" ? user.id : String(req.nextUrl.searchParams.get("chairmanId") || "");
  if (!cid) return NextResponse.json({ error: "Choose an institute." }, { status: 400 });
  const setting = await getRetention(cid);
  const p = await retentionPreview(cid, setting);
  return NextResponse.json({ setting, preview: { users: p.users.length, students: p.students, marks: p.marks, attendance: p.attendance } });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["SUPER_USER", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cid = user.role === "CHAIRMAN" ? user.id : String(b.chairmanId || "");
  if (!cid) return NextResponse.json({ error: "Choose an institute." }, { status: 400 });
  if (b.apply) {
    if (user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the Super Admin can remove data, after checking the preview." }, { status: 403 });
    if (b.confirm !== "REMOVE") return NextResponse.json({ error: 'Type REMOVE to confirm.' }, { status: 400 });
    return NextResponse.json({ ok: true, removed: await applyRetention(cid, user.id) });
  }
  await setRetention(cid, { inactiveUserMonths: num(b.inactiveUserMonths, 600), graduatedDetailYears: num(b.graduatedDetailYears, 100) }, user.id);
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
