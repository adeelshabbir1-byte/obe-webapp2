import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { savePrefs, STUDENT_KINDS } from "../../../../lib/studentAlerts";

// POST { k_<KIND>: boolean ..., parentWeekly } — which SMS / WhatsApp alerts the student receives.
export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    await savePrefs(st.id, STUDENT_KINDS.filter(([k]) => b[`k_${k}`] === false).map(([k]) => k), b.parentWeekly !== false);
    return NextResponse.json({ ok: true, message: "Saved." });
  } catch { return NextResponse.json({ error: "Alert choices need prisma/migration_data_import.sql — ask your institute to run it." }, { status: 500 }); }
}
