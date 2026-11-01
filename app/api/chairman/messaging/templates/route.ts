import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { itAccess } from "../../../../../lib/itManager";
import { saveSetting } from "../../../../../lib/scopedSettings";
import { parseTpl } from "../../../../../lib/msgTemplates";
import { withErrors } from "../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// PUT { lang, kinds: { KIND: { en, ur } } } — the institute's alert templates (Adeel prompt §5).
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const it = await itAccess(user as never);
  if (!it || !it.canAct) return NextResponse.json({ error: "Only the IT Manager (or the Institute Head when there is none) changes templates." }, { status: 403 });
  const t = parseTpl(JSON.stringify(await req.json().catch(() => ({}))));
  for (const k of Object.keys(t.kinds)) t.kinds[k] = { en: String(t.kinds[k].en || "").slice(0, 500), ur: String(t.kinds[k].ur || "").slice(0, 500) };
  await saveSetting(it.chairmanId, "INSTITUTE", it.chairmanId, "msg.tpl", JSON.stringify(t), user.id);
  return NextResponse.json({ ok: true });
}
export const PUT = withErrors(PUT_handler);
