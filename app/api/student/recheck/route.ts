import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { requestRecheck, CONTROLLER_HINT } from "../../../../lib/examController";

export async function POST(req: NextRequest) {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { await requestRecheck(s, String(b.courseId), String(b.reason || "")); return NextResponse.json({ ok: true, message: "Sent to the Controller of Examinations." }); }
  catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? CONTROLLER_HINT : m }, { status: 400 }); }
}
