import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { itAccess } from "../../../lib/itManager";
import { removeTool, saveTool, testTool, TOOLS_HINT } from "../../../lib/teachingTools";
import { isTool } from "../../../lib/teachingToolsCore";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { action: save {tool, ...fields} | test {tool} | remove {tool} } — the IT Manager (the Institute Head until one is
// named) connects the institute's teaching tools. Secrets are encrypted at rest and never sent back to the browser.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const it = user && user.mfaVerified ? await itAccess(user) : null;
  if (!user || !it || !it.canAct) return NextResponse.json({ error: "Only the IT Manager does this (the Institute Head until one is named)." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tool = String(b.tool || "");
  if (!isTool(tool)) return NextResponse.json({ error: "Choose a tool." }, { status: 400 });
  try {
    if (b.action === "save") { const r = await saveTool(user, it.chairmanId, tool, (b.form || {}) as Record<string, unknown>); return NextResponse.json(r); }
    if (b.action === "test") return NextResponse.json(await testTool(it.chairmanId, tool));
    if (b.action === "remove") { await removeTool(user, it.chairmanId, tool); return NextResponse.json({ ok: true }); }
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /teachingTool|does not exist|undefined/.test(m) ? TOOLS_HINT : m }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
