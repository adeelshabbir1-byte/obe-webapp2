import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/session";
import { createStudentSession } from "../../../../lib/studentSession";
import { writeAuditLog } from "../../../../lib/audit";
import { demoLoginTarget } from "../../../../lib/demoReady";
import { withErrors } from "../../../../lib/apiHandler";

// POST { role } — one-click sign-in as a demo person. Only for the institute flagged as a demo, only while its demo
// logins are switched on, and only as one of its own people; refused everywhere else.
async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  let t: Awaited<ReturnType<typeof demoLoginTarget>>;
  try { t = await demoLoginTarget(String(b.role || "")); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const ip = req.headers.get("x-forwarded-for") || undefined, ua = req.headers.get("user-agent") || undefined;
  if (t.kind === "student") {
    await createStudentSession(t.id, ip, ua);
    await writeAuditLog({ action: "DEMO_LOGIN", metadata: { studentId: t.id, role: "student" } });
    return NextResponse.json({ ok: true, href: "/student/dashboard" });
  }
  await createSession(t.id, ip, ua, true);
  await writeAuditLog({ actorUserId: t.id, action: "DEMO_LOGIN", metadata: { role: String(b.role) } });
  return NextResponse.json({ ok: true, href: typeof b.next === "string" && b.next.startsWith("/") && !b.next.startsWith("//") ? b.next : "/dashboard" });
}
export const POST = withErrors(POST_handler);
