import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { pdb, storeFile, MAX_FILE } from "../../../lib/portfolio";

import { LAB_ROLES } from "../../../lib/labFile";
import { withErrors } from "../../../lib/apiHandler";
const KINDS = ["MANUAL", "SOP", "SAFETY_TRAINING", "MAINTENANCE", "EQUIPMENT", "CALIBRATION"];

// The lab file: add a record (with an optional document) or remove one.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !LAB_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user);
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      await pdb.labFileEntry.deleteMany({ where: { id: String(b.id || ""), chairmanId: cid } });
      return NextResponse.json({ ok: true });
    }
    const fd = await req.formData();
    const g = (k: string, n = 200) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null; };
    const lab = g("lab", 120), title = g("title"), kind = g("kind", 20);
    if (!lab || !title || !kind || !KINDS.includes(kind)) return NextResponse.json({ error: "Choose the lab, the type and give a title." }, { status: 400 });
    const file = fd.get("file") as File | null;
    if (file && file.size > MAX_FILE) return NextResponse.json({ error: "File is over 8 MB." }, { status: 400 });
    const fileUrl = file && file.size ? await storeFile(file) : null;
    await pdb.labFileEntry.create({ data: { chairmanId: cid, lab, kind, title, courseCode: g("courseCode", 40), entryDate: g("entryDate") ? new Date(g("entryDate")!) : null, note: g("note", 2000), fileName: file && file.size ? file.name.slice(0, 200) : null, fileUrl, createdById: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && /storage/i.test(e.message) ? e.message : "Run prisma/migration_visit_extras.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
