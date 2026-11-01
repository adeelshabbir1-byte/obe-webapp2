import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { decideExit, requestExit, setKind } from "../../../lib/adp";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { action: kind {program, kind, feedsInto, discipline} | exit {studentId} | decideExit {id, approve, degreeNo} }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "kind") { if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new Error("The IH, Dean or HOD sets program kinds."); await setKind(await chairmanIdFor(user as never), String(b.program), b.kind === "ADP" ? "ADP" : "BS", b.feedsInto || null, b.discipline || null); return NextResponse.json({ ok: true }); }
    if (b.action === "exit") return NextResponse.json({ id: await requestExit(user, String(b.studentId)) });
    if (b.action === "decideExit") { await decideExit(user as never, String(b.id), !!b.approve, String(b.degreeNo || "")); return NextResponse.json({ ok: true }); }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
