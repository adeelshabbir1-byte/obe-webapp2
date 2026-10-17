import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { xdb, normPhone } from "../../../../lib/messaging";

// A student sets the mobile numbers that receive quiz, hand-in and result alerts.
export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const phone = b.phone ? normPhone(b.phone) : null, guardianPhone = b.guardianPhone ? normPhone(b.guardianPhone) : null;
  if ((b.phone && !phone) || (b.guardianPhone && !guardianPhone)) return NextResponse.json({ error: "Enter mobile numbers like 03001234567." }, { status: 400 });
  try {
    await xdb.studentContact.upsert({ where: { studentId: st.id }, create: { studentId: st.id, phone, guardianPhone, whatsapp: !!b.whatsapp }, update: { phone, guardianPhone, whatsapp: !!b.whatsapp } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Alerts are not set up yet." }, { status: 500 }); }
}
