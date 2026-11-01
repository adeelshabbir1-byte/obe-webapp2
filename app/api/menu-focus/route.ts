import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { setFlag } from "../../../lib/scopedSettings";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const OK = ["", "EXAM_CONTROLLER", "QEC", "OMC_CONVENER", "IT_MANAGER", "CURRICULUM_BUILDER", "COE_TEAM", "AFFILIATION", "COLLAB"];
// POST { focus } — which workspace's menu this person sees ("" = their role). The menu only; rights don't change.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { focus?: string };
  const f = String(b.focus || "");
  if (!OK.includes(f)) return NextResponse.json({ error: "Unknown workspace." }, { status: 400 });
  await setFlag(user.id, "menuFocus", f);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
