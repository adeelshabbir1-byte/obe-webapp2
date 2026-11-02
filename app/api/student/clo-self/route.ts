import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { saveMine } from "../../../../lib/cloSelf";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json(await saveMine(st.id, String(b.courseId || ""), b.ratings && typeof b.ratings === "object" ? b.ratings : {})); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
