import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { saveDetail } from "../../../../lib/aas";
import { STUDENT_SELF, checkValues } from "../../../../lib/aasFields";

/** POST — the signed-in student saves their own details (the fields NCEAC's Student Directory asks for). */
export async function POST(req: Request) {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const v = Object.fromEntries(STUDENT_SELF.map((k) => [k, typeof b[k] === "string" ? b[k] : ""]));
  const bad = checkValues("student", v);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try { await saveDetail("student", s.id, v, s.id); } catch { return NextResponse.json({ error: "Not set up yet — ask your Program Lead (database update pending)." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
