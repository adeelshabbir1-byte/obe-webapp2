import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { setFlag } from "../../../lib/scopedSettings";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// PUT { large: boolean, contrast: boolean } — the person's text size and contrast, applied app-wide (Adeel prompt §19.6).
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { large?: boolean; contrast?: boolean };
  const v = [b.large ? "large" : "", b.contrast ? "contrast" : ""].filter(Boolean).join(",");
  await setFlag(user.id, "display", v || null);
  return NextResponse.json({ ok: true, display: v });
}
export const PUT = withErrors(PUT_handler);
