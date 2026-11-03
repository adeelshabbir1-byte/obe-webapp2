import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { rolloverApply } from "../../../lib/rollover";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(await rolloverApply(u as never, Array.isArray(b.only) ? b.only.map(String) : undefined)); }
  catch (e) { const m = (e as Error).message; return NextResponse.json({ error: m === "forbidden" ? "Only the Program Lead, OMC, HOD, Dean or Institute Head rolls over a term." : m }, { status: 400 }); }
}
