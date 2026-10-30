import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addCampus, setCampus, CAMPUS_HINT } from "../../../lib/campus";
import { withErrors } from "../../../lib/apiHandler";

// POST { action: add | assign | filter, ... }. Filter (choose the campus to look at) is open to all staff.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "filter") {
    const r = NextResponse.json({ ok: true, message: "Campus filter set." });
    if (b.campus) r.cookies.set("campus", String(b.campus).slice(0, 60), { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 180 });
    else r.cookies.delete("campus");
    return r;
  }
  if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets up campuses." }, { status: 403 });
  const cid = await chairmanIdFor(user);
  try {
    if (b.action === "add") { await addCampus(cid, String(b.name || ""), String(b.city || ""), String(b.code || "")); return NextResponse.json({ ok: true, message: "Campus added." }); }
    if (b.action === "assign") {
      const kind = ["BATCH", "ROOM", "USER"].includes(b.kind) ? b.kind : null;
      const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
      if (!kind || !ids.length) return NextResponse.json({ error: "Tick at least one." }, { status: 400 });
      await setCampus(cid, kind, ids, String(b.campusId || "main"));
      return NextResponse.json({ ok: true, message: `${ids.length} moved.` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /campus|does not exist/i.test(m) && /relation|exist/.test(m) ? CAMPUS_HINT : m }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
