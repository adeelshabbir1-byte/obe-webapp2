import { prisma } from "../lib/db";
import { previousOfferings } from "../lib/courseHistory";
import { ActionButton, ActionForm } from "./fyp/FypClient";

// On a course page: earlier offerings (when, batch, teacher, Subject Expert) with import of a particular plan, and —
// for the Subject Expert — proposing a change for future batches (through OMC → BOS).
export default async function CoursePlanTools({ courseId, as }: { courseId: string; as: "SE" | "INSTRUCTOR" }) {
  const [rows, me] = await Promise.all([previousOfferings(courseId), prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, subjectExpertId: true } })]);
  return (
    <div className="card">
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Previously taught ({rows.length}) {as === "SE" ? "· propose a change for future batches" : "· use my own plan from last time"}</summary>
        {as === "SE" && <div style={{ margin: "10px 0", padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
          <b style={{ fontSize: 13 }}>For future batches</b>
          <p className="small-note" style={{ marginTop: 2 }}>Your changes stay in this batch. To have new batches get them, propose them: the OMC keeps them for this batch only or sends them to the Board of Studies; once approved (minutes attached) the OMC forwards them to the university curriculum.</p>
          <ActionForm showMessage url="/api/curriculum-changes" fixed={{ action: "propose", courseId, plan: "SE" }} submit="Propose my plan for future batches" collapsed openLabel="Propose my plan…" fields={[{ name: "summary", label: "What changes", type: "textarea", full: true }, { name: "reason", label: "Why (CQI finding, feedback …)", full: true }]} />
          <ActionForm showMessage url="/api/curriculum-changes" fixed={{ action: "propose", courseId, plan: "INSTRUCTOR" }} submit="Propose the teacher's version" collapsed openLabel="Adopt the teacher's delivery version…" fields={[{ name: "summary", label: "What the teacher changed that should stay", type: "textarea", full: true }, { name: "reason", label: "Why", full: true }]} />
        </div>}
        {as === "INSTRUCTOR" && <div style={{ margin: "10px 0" }}><ActionButton showMessage url="/api/course-history" body={{ action: "useSePlan", targetCourseId: courseId }} label="Use the Subject Expert's plan for this class" className="btn btn-secondary btn-sm" confirmText="Replace your delivery copy with the Subject Expert's current plan? (Only before teaching starts.)" /></div>}
        {rows.length === 0 ? <p className="small-note">Not taught before in this institute.</p> : <div style={{ overflowX: "auto" }}><table style={{ fontSize: 12.5, width: "100%" }}>
          <thead><tr><th>Term</th><th>Batch</th><th>Teacher</th><th>Subject Expert</th><th>Students</th><th>Plans</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td>{r.offeredTermName ? `${r.offeredTermName} ${r.offeredTermYear || ""}` : "—"}</td><td>{r.batch?.degreeProgram} — {r.batch?.batchName}</td>
            <td>{r.instructor?.name || "—"}</td><td>{r.subjectExpert?.name || "—"}</td><td>{r._count.studentEnrollments}</td>
            <td className="small-note">{r.sePlan ? `SE plan (${r.sePlan} CLOs)` : "no SE plan"}{r.insPlan ? " · teacher's delivery" : ""}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {as === "SE" && me?.subjectExpertId && r.sePlan > 0 && <ActionButton showMessage url="/api/course-history" body={{ action: "import", targetCourseId: courseId, sourceCourseId: r.id, plan: "SE" }} label="Import SE plan" className="btn btn-secondary btn-sm" confirmText="Replace your plan with this offering's Subject Expert plan?" />}{" "}
              {as === "SE" && me?.subjectExpertId && r.insPlan > 0 && <ActionButton showMessage url="/api/course-history" body={{ action: "import", targetCourseId: courseId, sourceCourseId: r.id, plan: "INSTRUCTOR" }} label="Import teacher's version" className="btn btn-secondary btn-sm" confirmText={`Replace your plan with ${r.instructor?.name || "the teacher"}'s delivery version?`} />}
              {as === "INSTRUCTOR" && r.instructor?.id === me?.instructorId && r.insPlan > 0 && <ActionButton showMessage url="/api/course-history" body={{ action: "import", targetCourseId: courseId, sourceCourseId: r.id, plan: "INSTRUCTOR" }} label="Use my plan from then" className="btn btn-sm" confirmText="Start this class from your own plan of that offering? Differences from the Subject Expert's plan show to them." />}
            </td></tr>)}</tbody></table></div>}
      </details>
    </div>
  );
}
