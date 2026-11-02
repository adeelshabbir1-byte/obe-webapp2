import { NextRequest, NextResponse } from "next/server";
import { addNote } from "../../../lib/collabPartner";

export const dynamic = "force-dynamic";

// Public, by token: a partner's focal person comments on or agrees a step of the joint programme.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(await addNote(String(b.token || "").slice(0, 80), String(b.step || "").slice(0, 40), String(b.text || ""), !!b.agree)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
