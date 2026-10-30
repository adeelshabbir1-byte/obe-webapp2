import { NextRequest, NextResponse } from "next/server";
import { chainFor } from "../../../../../lib/topicChecks";
import { forbidden, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// GET ?courseId=&dir=down|up|both — the chain of courses to open, in semester order (preview first).
async function GET_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  const dir = sp.get("dir") === "up" ? "up" : sp.get("dir") === "both" ? "both" : "down";
  const r = await chainFor(String(sp.get("courseId") || ""), dir);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export const GET = withErrors(GET_handler);
