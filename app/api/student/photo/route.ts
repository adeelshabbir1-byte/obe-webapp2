import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

const pdb = prisma as unknown as Record<string, any>;

// GET — the signed-in student's photo (data URL) or null. POST { photo } — save it (a small JPEG, resized in the browser).
async function GET_handler() {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ photo: null });
  const row = await pdb.studentPhoto.findUnique({ where: { studentId: s.id } }).catch(() => null);
  return NextResponse.json({ photo: row?.photo || null });
}
async function POST_handler(req: NextRequest) {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const photo = typeof b.photo === "string" ? b.photo : "";
  if (photo && (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > 400_000)) return NextResponse.json({ error: "Use a JPEG or PNG under about 300 KB." }, { status: 400 });
  try {
    if (!photo) await pdb.studentPhoto.deleteMany({ where: { studentId: s.id } });
    else await pdb.studentPhoto.upsert({ where: { studentId: s.id }, create: { studentId: s.id, photo, updatedAt: new Date() }, update: { photo, updatedAt: new Date() } });
  } catch { return NextResponse.json({ error: "Photos need prisma/migration_academic_rules.sql — ask the administrator." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
