import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../../lib/session";

// Same split as the student bulk-upload: pure file/text parsing here, no
// database work — the slow part (matching roll numbers, looking up the
// grading scale, writing records) happens in small chunks in the sibling
// /import endpoint. Expected columns, in order: Roll Number, Course Code,
// Course Title, Credit Hours, Grade, Term Name, Term Year.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const csvText = formData.get("csvText") as string | null;
  if (!file && !csvText) return NextResponse.json({ error: "a file or pasted text is required" }, { status: 400 });

  type Row = { rollNumber: string; courseCode: string; courseTitle: string; creditHours: string; grade: string; termName: string; termYear: string };
  const rows: Row[] = [];

  function pushIfValid(cells: string[]) {
    const [rollNumber, courseCode, courseTitle, creditHours, grade, termName, termYear] = cells.map((c) => (c || "").trim());
    if (rollNumber && courseCode && courseTitle && creditHours && grade && termName && termYear) {
      rows.push({ rollNumber, courseCode, courseTitle, creditHours, grade, termName, termYear });
    }
  }

  try {
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.name.toLowerCase().endsWith(".csv")) {
        for (const line of buffer.toString("utf-8").split(/\r?\n/)) pushIfValid(line.split(","));
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.worksheets[0];
        if (!sheet) return NextResponse.json({ error: "the uploaded file has no worksheet" }, { status: 400 });
        sheet.eachRow((row) => {
          const cells = [1, 2, 3, 4, 5, 6, 7].map((i) => row.getCell(i).text?.trim() || "");
          pushIfValid(cells);
        });
      }
    } else if (csvText) {
      for (const line of csvText.split(/\r?\n/)) pushIfValid(line.split(/[,\t]/));
    }
  } catch {
    return NextResponse.json({ error: "couldn't read that file — make sure it's a valid .xlsx or .csv" }, { status: 400 });
  }

  const dataRows = rows.filter((r) => !(r.rollNumber.toLowerCase().includes("roll") && r.courseCode.toLowerCase().includes("code")));
  if (dataRows.length === 0) {
    return NextResponse.json({ error: "no valid rows found — each line needs Roll Number, Course Code, Course Title, Credit Hours, Grade, Term Name, Term Year" }, { status: 400 });
  }

  return NextResponse.json({ rows: dataRows });
}
