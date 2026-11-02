import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { pilotFigures, saveMinutes, PERIODS } from "../../../lib/pilotFigures";
import { PdfDoc } from "../../../lib/pdfDoc";

export const dynamic = "force-dynamic";
const VIEW = ["CHAIRMAN", "DEAN"];

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !VIEW.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user);
  const d = Number(req.nextUrl.searchParams.get("days"));
  const days = PERIODS.includes(d) ? d : 90;
  const f = await pilotFigures(cid, days);
  const pdf = await PdfDoc.create("OBEHUB pilot figures");
  pdf.title("Pilot figures — work done in OBEHUB", `Last ${days} days (since ${f.since.toISOString().slice(0, 10)}) · ${f.people} of ${f.staff} staff recorded work`);
  pdf.table([["Area", 34], ["Tasks recorded", 14], ["Minutes per task before", 16], ["Minutes per task now", 16], ["Hours saved", 14]], f.rows.map((r) => [r.label, r.count, r.before ?? "not entered", r.now ?? "not entered", r.hoursSaved ?? "-"]));
  pdf.kv([["Tasks recorded", f.total], ["Hours saved", f.hoursSaved === null ? "Enter the minutes first" : `${f.hoursSaved} (from ${f.entered} area${f.entered === 1 ? "" : "s"})`]]);
  pdf.note("Tasks are counted by OBEHUB from its activity log. The minutes per task before and now are this institute's own estimates; hours saved = tasks x (before - now) / 60.");
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="pilot-figures-${days}d.pdf"` } });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head enters the minutes." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, minutes: await saveMinutes(await chairmanIdFor(user), b.minutes, user.id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
