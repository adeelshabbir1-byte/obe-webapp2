import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { saveSetting, clearSetting } from "../../../../lib/scopedSettings";
import { COLOR_KEY, WATERMARK_KEY, contrastWithWhite, suggestPassing, validHex } from "../../../../lib/brandLook";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// PUT { color?: "#RRGGBB" | null, watermark?: "off" | "center" | "corner" } — the Institute Head sets the institute's look.
// A colour that fails WCAG AA contrast with white text (4.5:1) is refused, with a passing suggestion.
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets the look." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { color?: string | null; watermark?: string };
  if (b.color === null || b.color === "") await clearSetting(user.id, "INSTITUTE", user.id, COLOR_KEY);
  else if (b.color !== undefined) {
    if (!validHex(b.color)) return NextResponse.json({ error: "Use a colour like #7E2435." }, { status: 400 });
    const ratio = contrastWithWhite(b.color);
    if (ratio < 4.5) return NextResponse.json({ error: `That colour is too light for white text (contrast ${ratio.toFixed(1)}:1, needs 4.5:1). Try ${suggestPassing(b.color)}.`, suggestion: suggestPassing(b.color) }, { status: 400 });
    await saveSetting(user.id, "INSTITUTE", user.id, COLOR_KEY, b.color, user.id);
  }
  if (b.watermark !== undefined) {
    if (!["off", "center", "corner"].includes(b.watermark)) return NextResponse.json({ error: "Choose off, center or corner." }, { status: 400 });
    await saveSetting(user.id, "INSTITUTE", user.id, WATERMARK_KEY, b.watermark, user.id);
  }
  return NextResponse.json({ ok: true });
}
export const PUT = withErrors(PUT_handler);
