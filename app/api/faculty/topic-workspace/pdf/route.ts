import { NextRequest, NextResponse } from "next/server";
import { accessFor, columnData } from "../../../../../lib/topicPlan";
import { calendarOf } from "../../../../../lib/topicChecks";
import { LEVEL_LABEL, type Level } from "../../../../../lib/topicPlanCore";
import { PdfDoc, RED, AMBER, GREEN } from "../../../../../lib/pdfDoc";
import { forbidden, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";

export const maxDuration = 60;

// GET ?courseId=&plan= — the lecture plan as a PDF: every topic with its week and date, importance, drop-safety,
// prerequisite links and reading.
export async function GET(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  const a = await accessFor(user, String(sp.get("courseId") || ""), sp.get("plan") === "SE" ? "SE" : sp.get("plan") === "INSTRUCTOR" ? "INSTRUCTOR" : null);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = await columnData(a);
  const cal = await calendarOf(a.courseId);
  // Planned date: two lectures a week from the semester start; the mid-term week(s) are skipped.
  const dateOf = (week: number, n: number) => {
    if (!cal.start) return "";
    const w = week + (cal.midWeek && week > cal.midWeek ? (cal.midLen || 1) : 0);
    const d = new Date(+cal.start + ((w - 1) * 7 + (n % 2 === 0 ? 3 : 0)) * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const pdf = await PdfDoc.create(`${a.code} lecture plan`);
  pdf.title(`${a.code} — ${a.title}`, `${a.plan === "SE" ? "Subject Expert's plan" : "Instructor's teaching plan"}${a.program ? ` · ${a.program} ${a.batch}` : ""}${a.textbook ? ` · Required books: ${a.textbook}` : ""}`);
  const level = (r: (typeof data.rows)[number]) => LEVEL_LABEL[(r.importance || r.prefill) as Level] + (r.importance && r.confirmed ? "" : " (suggested)");
  const safety = (m: string) => (m === "⛔" ? "Keep" : m === "✓" ? "Can drop" : "Care");
  pdf.table(
    [["#", 22], ["Wk", 24], ["Date", 62], ["Topic", 150], ["Importance", 70], ["Drop", 46], ["Links", 80], ["Reading", 57]],
    data.rows.map((r) => [
      r.lectureNumber, r.week, dateOf(r.week, r.lectureNumber), `${r.topic}${r.subtopic ? ` — ${r.subtopic}` : ""}${r.notTaught ? " [planned, not taught]" : ""}`,
      level(r), safety(r.safety.mark),
      [...r.needs.map((n) => `needs ${n.code}: ${n.topic} (${n.strength.toLowerCase()})`), ...r.dependents.map((d) => `for ${d.code}: ${d.topic} (${d.strength.toLowerCase()})`)].join("; ") || "-",
      r.reading || "-",
    ]),
    { size: 7.5, colour: (row, col) => (col === 5 ? (data.rows[row].safety.mark === "⛔" ? RED : data.rows[row].safety.mark === "✓" ? GREEN : AMBER) : undefined) },
  );
  pdf.note(`${data.rows.length} lectures · Core ${data.rows.filter((r) => (r.importance || r.prefill) === "CORE").length} · Important ${data.rows.filter((r) => (r.importance || r.prefill) === "IMPORTANT").length} · Optional ${data.rows.filter((r) => (r.importance || r.prefill) === "OPTIONAL").length}. Drop: "Keep" = must not be dropped, "Care" = check first, "Can drop" = safe.`);
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${a.code.replace(/[^A-Za-z0-9-]/g, "")}-lecture-plan.pdf"` } });
}
