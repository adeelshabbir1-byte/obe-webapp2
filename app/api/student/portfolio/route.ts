import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { pdb, storeFile, MAX_FILE, KINDS } from "../../../../lib/portfolio";

const clip = (v: FormDataEntryValue | null, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// A student adds or removes their own e-portfolio entries.
export async function POST(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const fd = await req.formData();
  const title = clip(fd.get("title"), 160);
  if (!title) return NextResponse.json({ error: "Give the entry a title." }, { status: 400 });
  const kind = KINDS.some((k) => k[0] === fd.get("kind")) ? String(fd.get("kind")) : "OTHER";
  const link = clip(fd.get("link"), 500);
  if (link && !/^https?:\/\//i.test(link)) return NextResponse.json({ error: "Links must start with http:// or https://" }, { status: 400 });
  const file = fd.get("file") as File | null;
  if (file && file.size > MAX_FILE) return NextResponse.json({ error: "File is over 8 MB." }, { status: 400 });
  try {
    const fileUrl = file && file.size ? await storeFile(file) : null;
    const n = await pdb.studentPortfolioItem.count({ where: { studentId: st.id } });
    if (n >= 60) return NextResponse.json({ error: "Portfolio is full (60 entries)." }, { status: 400 });
    await pdb.studentPortfolioItem.create({ data: { studentId: st.id, title, kind, description: clip(fd.get("description"), 3000), link, fileName: file && file.size ? file.name.slice(0, 200) : null, fileUrl, ploCodes: clip(fd.get("ploCodes"), 200) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && /storage/i.test(e.message) ? e.message : "Portfolio is not set up yet — ask the office to run prisma/migration_portfolio.sql." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  await pdb.studentPortfolioItem.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") || "", studentId: st.id, verifiedAt: null } });
  return NextResponse.json({ ok: true });
}
