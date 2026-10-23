import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { visibleBatchIds } from "../../../lib/studentScope";
import { coursesInDegree, whereUsed } from "../../../lib/courseHome";

const q = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

// GET ?batch=… (courses in a degree) or ?dept=… (where a department's courses are used) — as CSV for Excel.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  let rows: string[] = [];
  if (p.get("batch")) {
    if (!(await visibleBatchIds(user)).includes(p.get("batch")!)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const d = await coursesInDegree(p.get("batch")!);
    if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
    rows = [["Home department", "Semester", "Code", "Title", "Credit hours", "Type", "Subject Expert", "Teacher"].map(q).join(","), ...d.groups.flatMap((g) => g.courses.map((c) => [g.home + (g.set ? "" : " (not set)"), c.semesterNumber, c.code, c.title, c.creditHours, c.courseType, c.subjectExpert?.name, c.instructor?.name].map(q).join(",")))];
  } else if (p.get("dept")) {
    const d = await whereUsed(p.get("dept")!, await chairmanIdFor(user));
    rows = [["Code", "Title", "Program", "Batch", "Offering department", "Semester", "Offered now", "Sections", "Students"].map(q).join(","), ...d.courses.flatMap((c) => c.uses.map((u) => [c.code, c.title, u.program, u.batch, u.department, u.semester, u.offered ? "Yes" : "No", u.sections, u.students].map(q).join(",")))];
  }
  return new NextResponse(rows.join("\n"), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${p.get("batch") ? "courses-in-degree" : "where-courses-used"}.csv"` } });
}
