import Link from "next/link";
import { prisma } from "../lib/db";
import { linkOf, followersOf } from "../lib/sectionLink";
import { ActionButton } from "./fyp/FypClient";

/** On a course page: this section follows a main section, or is the main section for others. */
export default async function SectionLinkBanner({ courseId }: { courseId: string }) {
  try {
    const l = await linkOf(courseId);
    if (l) {
      const m = await prisma.course.findUnique({ where: { id: l.masterId }, select: { id: true, code: true, batch: { select: { batchName: true } } } });
      return <div className="card no-print" style={{ borderLeft: "4px solid #1B6CA8", fontSize: 13 }}>This section is taught as one with <Link href={`/instructor/courses/${l.masterId}/clos`}><b>{m?.code} — {m?.batch?.batchName || "main section"}</b></Link>: CLOs, weights, assessments, lecture plan and paper come from there. Attendance, the lecture log and marks stay separate for this section. <ActionButton url="/api/instructor/section-link" body={{ action: "unlink", courseId }} label="Unlink" className="btn btn-secondary btn-sm" confirmText="Stop following the main section? This section keeps its current plan." /></div>;
    }
    const f = await followersOf(courseId);
    if (f.length) return <div className="card no-print" style={{ borderLeft: "4px solid #1F5E36", fontSize: 13 }}>Main section for {f.length} linked section{f.length > 1 ? "s" : ""}: your plan changes here are copied to them when they are opened. <ActionButton url="/api/instructor/section-link" body={{ action: "sync", masterId: courseId }} label="Copy to linked sections now" className="btn btn-secondary btn-sm" /></div>;
  } catch { /* table not created yet */ }
  return null;
}
