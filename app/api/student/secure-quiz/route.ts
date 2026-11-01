import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { withErrors } from "../../../../lib/apiHandler";
import { start, save, beat, event, submit } from "../../../../lib/quizzes";

// The student side of a secure quiz: start (or resume), save after every question, heartbeat, integrity events, submit.
// Keys never leave the server. A quiz that requires Safe Exam Browser checks its key headers on every call.
const requestUrl = (req: NextRequest) => {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
};
async function POST_handler(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = { url: requestUrl(req), ua: req.headers.get("user-agent") || "", configHash: req.headers.get("x-safeexambrowser-configkeyhash"), requestHash: req.headers.get("x-safeexambrowser-requesthash") };
  try {
    switch (b.action) {
      case "start": return NextResponse.json(await start(st, String(b.quizId || ""), r));
      case "save": return NextResponse.json(await save(st, String(b.runId || ""), b.answers && typeof b.answers === "object" ? b.answers : {}, b.pos === undefined ? null : Number(b.pos)));
      case "beat": return NextResponse.json(await beat(st, String(b.runId || "")));
      case "event": return NextResponse.json(await event(st, String(b.runId || ""), String(b.kind || ""), b.awayMs == null ? null : Number(b.awayMs)));
      case "submit": return NextResponse.json(await submit(st, String(b.runId || "")));
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    if ((e as { code?: string }).code) throw e;
    return NextResponse.json({ error: (e as Error).message, seb: (e as { seb?: boolean }).seb || undefined }, { status: (e as { status?: number }).status || 400 });
  }
}
export const POST = withErrors(POST_handler);
