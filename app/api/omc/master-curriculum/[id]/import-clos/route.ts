import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export const maxDuration = 60;

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];

// Loads CLOs (with their PLO mapping) into the courses of THIS institute's own master curriculum, from an Excel file
// with the columns of the Export's "CLOs and PLO mapping" sheet: Course code, CLO, Statement, Bloom level, Mapped PLO.
// For every course code that appears in the file, that course's existing CLOs are REPLACED by the ones in the file.
// Courses that are not in the file are not touched.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.id },
    include: { plos: true, courses: { select: { id: true, code: true } } },
  });
  if (!curriculum || curriculum.chairmanId !== user.managedById) {
    return NextResponse.json({ error: "Only your own copy can be changed. Clone the curriculum first (button above), then import into the clone." }, { status: 403 });
  }

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
      // Prefer the sheet that has the CLO columns.
      let ws = wb.worksheets.find((w) => { const r1 = w.getRow(1); let ok = false; r1.eachCell((c) => { if (/statement/i.test(c.text || "")) ok = true; }); return ok; }) || wb.worksheets[0];
      ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); }); grid.push(cells); });
    }
  } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  const hi = grid.findIndex((r) => r.some((c) => /statement/i.test(c || "")) && r.some((c) => /course\s*code|^code$/i.test(c || "")));
  if (hi < 0) return NextResponse.json({ error: "no heading row with Course code and Statement found" }, { status: 400 });
  const f = (re: RegExp) => grid[hi].findIndex((c) => re.test(c || ""));
  const col = { code: f(/course\s*code|^code$/i), clo: f(/^clo$/i), st: f(/statement/i), bloom: f(/bloom/i), plo: f(/(mapped\s*)?plo/i) };
  if (col.bloom < 0) return NextResponse.json({ error: "a Bloom level column is needed" }, { status: 400 });

  const courseByCode = new Map(curriculum.courses.map((c) => [c.code.trim().toUpperCase(), c.id]));
  const ploByNumber = new Map(curriculum.plos.map((p) => [p.number, p.id]));
  const byCourse = new Map<string, { statement: string; bloom: string; ploId: string | null }[]>();
  const errors: string[] = [];
  for (const r of grid.slice(hi + 1)) {
    const code = (r[col.code] || "").trim().toUpperCase();
    if (!code) continue;
    if (!courseByCode.has(code)) { errors.push(`Course ${code} is not in this curriculum`); continue; }
    const statement = (r[col.st] || "").replace(/\s*\[new draft CLO\]\s*$/i, "").trim();
    const bloom = (r[col.bloom] || "").toUpperCase().replace(/\s+/g, "");
    if (!statement || !BLOOM.includes(bloom)) { errors.push(`${code} ${r[col.clo] || ""}: needs a statement and Bloom level C1 to C6`); continue; }
    let ploId: string | null = null;
    if (col.plo >= 0 && r[col.plo]) {
      const n = parseInt(String(r[col.plo]).replace(/\D+/g, ""), 10);
      ploId = ploByNumber.get(n) || null;
      if (!ploId) errors.push(`${code}: PLO-${n} does not exist in this curriculum`);
    }
    byCourse.set(code, [...(byCourse.get(code) || []), { statement, bloom, ploId }]);
  }
  if (byCourse.size === 0) return NextResponse.json({ error: "no usable CLO rows found", errors: errors.slice(0, 10) }, { status: 400 });

  let clos = 0;
  for (const [code, list] of Array.from(byCourse.entries())) {
    const courseId = courseByCode.get(code)!;
    await prisma.$transaction([
      prisma.masterCourseClo.deleteMany({ where: { masterCourseId: courseId } }),
      prisma.masterCourseClo.createMany({
        data: list.map((c, i) => ({ masterCourseId: courseId, statement: c.statement, bloomLevel: c.bloom, orderIndex: i, mappedPloId: c.ploId, ploMappingSource: c.ploId ? "MANUAL" : null })),
      }),
    ]);
    clos += list.length;
  }
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CLOS_IMPORTED_FROM_FILE", entityType: "MasterCurriculum", entityId: curriculum.id, metadata: { courses: byCourse.size, clos, problems: errors.length } });
  return NextResponse.json({ courses: byCourse.size, clos, errors: Array.from(new Set(errors)).slice(0, 15) });
}
