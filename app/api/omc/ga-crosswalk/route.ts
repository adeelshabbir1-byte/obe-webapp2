import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { crosswalkAct, confirmForeignGa } from "../../../../lib/gaCrosswalk";

// GA crosswalk (edit · endorse · finalise) and a foreign course's GAs for the term (confirm).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  if (b.action === "confirmGa") {
    const gas = Object.keys(b).filter((k) => k.startsWith("ga_") && (b[k] === true || b[k] === "on" || b[k] === "true")).map((k) => k.slice(3));
    const r = await confirmForeignGa({ id: user.id, name: user.name }, String(b.courseId || ""), String(b.term || ""), gas.length ? gas : (Array.isArray(b.gas) ? b.gas : []));
    return "error" in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, message: r.message });
  }
  const r = await crosswalkAct({ id: user.id, name: user.name }, chairmanId, b);
  return "error" in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
}
