import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../../lib/session";

// Pure file/text parsing, no database writes at all — this is the fast
// part (reading file structure into rows) split out from the slow part
// (looking up batches, upserting students, activating logins one at a
// time), so the actual database work can be done afterward in small
// chunks that each stay comfortably inside a serverless function's time
// limit, rather than one request trying to do everything for however
// many hundreds of rows the file contains and getting cut off mid-way
// with an unparseable response.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const csvText = formData.get("csvText") as string | null;
  if (!file && !csvText) return NextResponse.json({ error: "a file or pasted text is required" }, { status: 400 });

  type Row = { name: string; rollNumber: string; batchName: string };
  const rows: Row[] = [];

  try {
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith(".csv")) {
        for (const line of buffer.toString("utf-8").split(/\r?\n/)) {
          const parts = line.split(",").map((p) => p.trim());
          if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) rows.push({ name: parts[0], rollNumber: parts[1], batchName: parts[2] });
        }
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.worksheets[0];
        if (!sheet) return NextResponse.json({ error: "the uploaded file has no worksheet" }, { status: 400 });
        sheet.eachRow((row) => {
          const a = row.getCell(1).text?.trim();
          const b = row.getCell(2).text?.trim();
          const c = row.getCell(3).text?.trim();
          if (a && b && c) rows.push({ name: a, rollNumber: b, batchName: c });
        });
      }
    } else if (csvText) {
      for (const line of csvText.split(/\r?\n/)) {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) rows.push({ name: parts[0], rollNumber: parts[1], batchName: parts[2] });
      }
    }
  } catch {
    return NextResponse.json({ error: "couldn't read that file — make sure it's a valid .xlsx or .csv" }, { status: 400 });
  }

  const dataRows = rows.filter((r) => !(r.name.toLowerCase() === "name" && r.rollNumber.toLowerCase().includes("roll")));
  if (dataRows.length === 0) return NextResponse.json({ error: "no valid rows found — each line needs Name, Roll Number, and Batch Name" }, { status: 400 });

  return NextResponse.json({ rows: dataRows });
}
