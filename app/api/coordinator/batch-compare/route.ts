import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { compareBatch, TAG_LABEL, sideText } from "../../../../lib/batchCompare";
import { batchAccess } from "../../../../lib/batchAccess";
import { PdfDoc } from "../../../../lib/pdfDoc";

/** GET ?batchId=&format=pdf|xlsx — the three-way comparison as a file (Program Lead, the department OMC, leadership). */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const batchId = q.get("batchId") || "";
  if (!(await batchAccess(user, batchId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const cmp = await compareBatch(batchId);
  if (!cmp) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const name = `${cmp.batch.replace(/[^A-Za-z0-9]+/g, "-")}-comparison`;
  const totals: (string | number)[][] = [
    ["Credit hours", cmp.totals.ch[0], cmp.totals.ch[1] || "—", cmp.totals.ch[2] || "—", cmp.totals.target ? `${cmp.totals.target[0]}–${cmp.totals.target[1]}` : "—", cmp.totals.chOk === null ? "—" : cmp.totals.chOk ? "✓" : "✗"],
    ["Courses", cmp.totals.count[0], cmp.totals.count[1] || "—", cmp.totals.count[2] || "—", "—", "—"],
    ...cmp.byType.map((t) => [`CH · ${t.type}`, t.now, t.council || "—", t.previous || "—", t.min !== null && t.max !== null ? `${t.min}–${t.max}` : t.min !== null ? `≥ ${t.min}` : t.max !== null ? `≤ ${t.max}` : "—", t.ok === null ? "—" : t.ok ? "✓" : "✗"]),
  ];
  const rows = cmp.rows.map((r) => [sideText(r.now), sideText(r.council), sideText(r.previous), r.tags.map((t) => TAG_LABEL[t]).join(", ")]);
  if (q.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Comparison");
    ws.addRow([`${cmp.batch} — three-way comparison`]).font = { bold: true, size: 14 };
    ws.addRow([`Council: ${cmp.councilTitle || "—"} · Previous batch: ${cmp.previousTitle || "—"} · ${new Date().toISOString().slice(0, 10)}`]);
    ws.addRow([]);
    ws.addRow(["Totals", "New batch", "Council", "Previous", "Council rule", "Meets"]).font = { bold: true };
    totals.forEach((t) => ws.addRow(t));
    ws.addRow([]);
    ws.addRow(["New batch", "Council curriculum", "Previous batch", "What changed"]).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => { c.width = i < 3 ? 46 : 28; });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  }
  const d = await PdfDoc.create(`${cmp.batch} comparison`);
  d.title(`${cmp.batch} — three-way comparison`, `Council: ${cmp.councilTitle || "—"} · Previous batch: ${cmp.previousTitle || "—"} · ${new Date().toLocaleDateString("en-GB")}`);
  d.kv(Object.entries(cmp.counts).filter(([, n]) => n > 0).map(([t, n]) => [TAG_LABEL[t as keyof typeof TAG_LABEL], n]));
  d.h2("Totals");
  d.table([["", 3], ["New", 1.2], ["Council", 1.2], ["Previous", 1.2], ["Rule", 1.6], ["Meets", 1]], totals.map((t) => t.map((x) => String(x).replace("✓", "yes").replace("✗", "no"))));
  d.h2("Course by course");
  d.table([["New batch", 3.4], ["Council curriculum", 3.4], ["Previous batch", 3.4], ["Changed", 2.2]], rows);
  return new NextResponse(Buffer.from(await d.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
}
