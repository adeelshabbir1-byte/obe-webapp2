import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { canWork, dataOf, type Prog } from "../../../lib/collab";
import { refreshOdlFacts } from "../../../lib/odlWizard";
import { runningOf, sessionsOf } from "../../../lib/teachingTools";
import { PdfDoc } from "../../../lib/pdfDoc";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// GET ?id= — the ODL programme's running-the-term evidence as one PDF for the QEC and HEC (internal monitoring, ODL
// Part-II 12.5; LMS attendance records, 21.1.viii): per course, credit-hour check, then week by week.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const p = (await db.collabProgramme?.findUnique({ where: { id: String(req.nextUrl.searchParams.get("id") || "") } })) as Prog | null;
  if (!p || p.chairmanId !== cid || !(await canWork(user as never, p))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auto = await refreshOdlFacts(p);
  const d = dataOf(p);
  const pdf = await PdfDoc.create(`${p.title} · ODL evidence · ${new Date().toLocaleDateString("en-GB")}`);
  pdf.title("ODL programme: running the term", p.title);
  pdf.note("Internal monitoring record (HEC ODL Policy Part-II 12.5), kept with LMS attendance records (21.1.viii). Figures come from OBEHUB and the connected teaching tools.");
  pdf.kv([["Programme lead", d.ownerName || "not assigned"], ["ODL Programme Coordinator", d.roles?.coordinator?.name || "not named"], ["Instructional Designer", d.roles?.designer?.name || "not named"], ["Live sessions held / planned", `${auto.running?.held ?? 0} / ${auto.running?.planned ?? 0}`], ["Late items", String(auto.running?.late ?? 0)]]);
  for (const c of d.courses || []) {
    const x = auto.delivery?.[c.code];
    pdf.h1(`${c.code} — ${c.mode === "SYNC" ? "Synchronous" : c.mode === "ASYNC" ? "Asynchronous" : "Blended"}, ${c.ch} CH`);
    if (!x?.courseId) { pdf.note("Not found in OBEHUB under this code."); continue; }
    pdf.h2("Credit-hour check");
    pdf.table([["Rule", 190], ["Clause", 70], ["Needed", 110], ["Has", 80], ["", 30]], x.lines.map((l) => [l.rule, l.clause, l.need, l.have, l.ok ? "OK" : "NO"]));
    const r = await runningOf(x.courseId);
    pdf.h2(`Week by week (${r.enrolled} enrolled)`);
    if (!r.weeks.length) pdf.note("No live sessions or discussion activity recorded yet.");
    else pdf.table([["Week", 40], ["Live held / planned", 90], ["Recordings", 60], ["Attendance", 60], ["Posts (teacher)", 70], ["Discussion h", 60], ["Late", 100]], r.weeks.map((w) => [w.week, `${w.held} / ${w.planned}`, w.recordings, w.attendancePct == null ? "-" : `${w.attendancePct}%`, `${w.posts} (${w.teacherPosts})`, w.discussionH || "-", w.late.length ? String(w.late.length) : "-"]));
    const ss = await sessionsOf(x.courseId);
    if (ss.length) { pdf.h2("Live sessions"); pdf.table([["Lecture", 45], ["Date", 90], ["Tool", 45], ["Status", 60], ["Minutes", 50], ["Attended", 55], ["Recording", 125]], ss.map((s) => [s.lectureNumber, s.startsAt.toISOString().slice(0, 16).replace("T", " "), s.tool === "GOOGLE" ? "Meet" : "Teams", s.status.toLowerCase().replace("_", " "), s.heldMinutes ?? "-", s.attendees ?? "-", s.recordingUrl ? (s.recordingUrl.startsWith("teams-recording:") ? "in Teams" : "linked") : "-"])); }
  }
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="ODL-evidence-${p.title.replace(/[^\w-]+/g, "-").slice(0, 60)}.pdf"` } });
}
export const GET = withErrors(GET_handler);
