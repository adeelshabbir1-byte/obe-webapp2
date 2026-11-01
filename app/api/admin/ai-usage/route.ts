import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { adminCan } from "../../../../lib/platformTeam";
import { saveSettings } from "../../../../lib/aiChecks";
import { withErrors } from "../../../../lib/apiHandler";

// POST { chairmanId, enabled, monthlyBudgetUsd, paperModel, planModel, prices } — the Super Admin's AI settings of an institute.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "BILLING"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.chairmanId) return NextResponse.json({ error: "Choose the institute." }, { status: 400 });
  await saveSettings(String(b.chairmanId), { enabled: b.enabled !== false, monthlyBudgetUsd: Number(b.monthlyBudgetUsd), paperModel: b.paperModel ? String(b.paperModel) : undefined, planModel: b.planModel ? String(b.planModel) : undefined, prices: b.prices && typeof b.prices === "object" ? b.prices : undefined }, user.id);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
