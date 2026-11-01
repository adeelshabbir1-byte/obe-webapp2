import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chainFor, clearSetting, saveSetting, type Scope } from "../../../../lib/scopedSettings";
import { scopedDef } from "../../../../lib/settingsRegistry";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// PUT { key, scope: INSTITUTE | DEPARTMENT | PROGRAM, value | null } — change one scoped setting (Adeel prompt §15).
// Institute: the Institute Head. Department default: the OMC (a member of that department) or the Institute Head.
// Program: its Program Lead (his value is final for his program).
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { key?: string; scope?: Scope; value?: string | null };
  const def = scopedDef(String(b.key || ""));
  if (!def) return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
  const chain = await chainFor(user as never);
  if (!chain.chairmanId) return NextResponse.json({ error: "No institute." }, { status: 400 });
  const omc = user.role === "OMC" || !!(user as { omcHat?: boolean }).omcHat;
  let scopeId = "";
  if (b.scope === "INSTITUTE" && user.role === "CHAIRMAN") scopeId = chain.chairmanId;
  else if (b.scope === "DEPARTMENT" && (omc || user.role === "CHAIRMAN") && chain.departmentId) scopeId = chain.departmentId;
  else if (b.scope === "PROGRAM" && user.role === "PROGRAM_COORDINATOR") scopeId = user.id;
  if (!scopeId) return NextResponse.json({ error: "You can't change this setting at that level." }, { status: 403 });
  if (b.value === null || b.value === "") { await clearSetting(chain.chairmanId, b.scope!, scopeId, def.key); return NextResponse.json({ ok: true }); }
  const n = Number(b.value);
  if (!Number.isFinite(n) || (def.min != null && n < def.min) || (def.max != null && n > def.max)) return NextResponse.json({ error: `Enter a number from ${def.min} to ${def.max}.` }, { status: 400 });
  await saveSetting(chain.chairmanId, b.scope!, scopeId, def.key, String(n), user.id);
  return NextResponse.json({ ok: true });
}
export const PUT = withErrors(PUT_handler);
