import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { canSetWork, setInstituteWeek, setPattern } from "../../../lib/workCalendar";
import { staffOf } from "../../../lib/hr";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// POST { action: week {days} | people {userIds, days|null, offDates?} } — HR (or the Institute Head) sets working days.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !canSetWork(user as never)) return NextResponse.json({ error: "Only HR or the Institute Head." }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const days = Array.isArray(b.days) ? b.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : null;
  if (b.action === "week") { if (!days?.length) return NextResponse.json({ error: "Choose at least one day." }, { status: 400 }); await setInstituteWeek(user, cid, days); return NextResponse.json({ ok: true }); }
  if (b.action === "people") {
    const staff = new Set((await staffOf(cid)).map((s) => s.id));
    const ids = (Array.isArray(b.userIds) ? b.userIds : []).map(String).filter((id: string) => staff.has(id));
    if (!ids.length) return NextResponse.json({ error: "Choose people." }, { status: 400 });
    await setPattern(user, cid, ids, b.reset ? [] : days, Array.isArray(b.offDates) ? b.offDates.map(String) : undefined);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
