import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { withErrors } from "../../../lib/apiHandler";
import { adminCan } from "../../../lib/platformTeam";
import * as F from "../../../lib/facultyStatus";

// Queue item 23. POST JSON { action: save | bulk | fullload | version | withdraw | letter-remove }; POST form-data
// (action=letter) adds a letter with its file; GET ?fte=csv downloads the faculty × program table.
export const dynamic = "force-dynamic";
const ACC_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR"];

async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const m = await F.fteMatrix(cid, req.nextUrl.searchParams.get("dept") || null);
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const csv = [["Name", "Designation", "Highest degree", "Employment", ...m.programs, "Total FTE", "Credit hours"].map(q).join(","),
    ...m.rows.map((r) => [r.name, r.designation, r.degree, r.employment, ...r.cells.map((c) => String(c.fte)), String(r.total), String(r.hours)].map(q).join(","))].join("\n");
  return new NextResponse(`${q(`Basis: ${m.basis}`)}\n${csv}`, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="faculty-fte-by-program.csv"' } });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      if (!ACC_ROLES.includes(user.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const cid = await chairmanIdFor(user as never);
      const fd = await req.formData(); const file = fd.get("file") as File | null;
      let fileUrl: string | null = null, fileName: string | null = null;
      if (file && file.size) {
        if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 400 });
        const { uploadEvidenceFile } = await import("../../../lib/evidenceValidation");
        fileName = file.name.slice(0, 200); fileUrl = await uploadEvidenceFile(Buffer.from(await file.arrayBuffer()), `letters/${cid}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, "_")}`, file.type || "application/octet-stream");
      }
      const g = (k: string) => String(fd.get(k) || "");
      await F.addLetter(user.id, cid, { program: g("program"), cycleId: g("cycleId"), counterpart: g("counterpart") || "NCEAC", direction: g("direction"), kind: g("kind"), refNo: g("refNo"), letterDate: g("letterDate"), subject: g("subject"), fileUrl, fileName });
      return NextResponse.json({ ok: true });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, any>;
    if (b.action === "version" || b.action === "withdraw") {
      if (!(await adminCan(user as never, "REGULATIONS"))) return NextResponse.json({ error: "Only the Super Admin team (Regulations Officer) keeps the requirements." }, { status: 403 });
      if (b.action === "withdraw") { await F.withdrawVersion(user.id, String(b.id)); return NextResponse.json({ ok: true }); }
      return NextResponse.json({ ok: true, id: await F.saveVersion(user.id, { body: String(b.body || "NCEAC"), label: String(b.label || ""), fromTerm: String(b.fromTerm || ""), fromYear: Number(b.fromYear), rules: b.rules || {}, note: b.note }) });
    }
    const cid = await chairmanIdFor(user as never);
    if (b.action === "letter-remove") { if (!ACC_ROLES.includes(user.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 }); await F.removeLetter(user.id, cid, String(b.id)); return NextResponse.json({ ok: true }); }
    if (!F.canEditFaculty(user as never)) return NextResponse.json({ error: "The Institute Head, Dean, Head of Department or HR changes faculty status." }, { status: 403 });
    if (b.action === "save") { await F.saveStatus(user.id, cid, String(b.userId), b.values || {}); return NextResponse.json({ ok: true }); }
    if (b.action === "bulk") return NextResponse.json({ ok: true, n: await F.saveMany(user.id, cid, Array.isArray(b.ids) ? b.ids.map(String) : [], b.values || {}) });
    if (b.action === "fullload") { await F.saveFullLoad(cid, Number(b.value), user.id); return NextResponse.json({ ok: true }); }
  } catch (e) { return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
