import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";

// Reads a course list from an Excel/CSV file and returns it as tab-separated lines for the Bulk Import box,
// so it can be reviewed there before anything is saved. Understands the sheet the Export button produces,
// and any sheet whose headings include Code, Title, Credit hours, Category (Domain and Semester optional).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.formData()).get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file first" }, { status: 400 });

  const grid: string[][] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".csv")) {
      for (const l of buf.toString("utf-8").split(/\r?\n/)) grid.push(l.split(",").map((x) => x.trim()));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.getWorksheet("Courses") || wb.worksheets[0];
      if (!ws) return NextResponse.json({ error: "the file has no sheet" }, { status: 400 });
      ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); });
    }
  } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  const hi = grid.findIndex((r) => r.some((c) => /^code$/i.test(c || "")) && r.some((c) => /^title$/i.test(c || "")));
  if (hi < 0) return NextResponse.json({ error: "no heading row with Code and Title found" }, { status: 400 });
  const find = (re: RegExp) => grid[hi].findIndex((c) => re.test(c || ""));
  const col = { code: find(/^code$/i), title: find(/^title$/i), cr: find(/credit/i), cat: find(/categor/i), dom: find(/domain/i), sem: find(/semester/i) };
  if (col.cr < 0 || col.cat < 0) return NextResponse.json({ error: "Credit hours and Category columns are needed" }, { status: 400 });

  const lines = grid.slice(hi + 1).filter((r) => r[col.code] && r[col.title]).map((r) =>
    [r[col.code], r[col.title], r[col.cr], r[col.cat], col.dom >= 0 ? r[col.dom] : "", col.sem >= 0 ? r[col.sem] : ""].join("\t"));
  if (lines.length === 0) return NextResponse.json({ error: "no course rows found" }, { status: 400 });
  return NextResponse.json({ text: lines.join("\n"), count: lines.length });
}
