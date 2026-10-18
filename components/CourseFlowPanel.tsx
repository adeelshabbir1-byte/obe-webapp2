import { courseChain, cachedBatchFlow } from "../lib/outcomeFlow";
import OutcomeFlow from "./OutcomeFlow";
import WeightAdvice from "./WeightAdvice";

// The 5-tier flow (Assessments → CLOs → Course → PLOs → PEOs) of one course plan, shown inside the course, with the weight advice.
export default async function CourseFlowPanel({ courseId, source }: { courseId: string; source: "SE" | "INSTRUCTOR" }) {
  const chain = await courseChain(courseId, source);
  if (!chain) return null;
  const flow = chain.course.batchId ? await cachedBatchFlow(chain.course.batchId) : null;
  const ploNumbers = new Set(chain.clos.map((c) => c.ploNumber).filter((n): n is number => n !== null));
  const plos = (flow?.plos || []).filter((p) => p.courses.some((c) => c.id === courseId) || ploNumbers.has(p.number)).map((p) => ({ ...p, courses: p.courses.filter((c) => c.id === courseId) }));
  const keep = new Set(plos.map((p) => p.number));
  const peos = (flow?.peos || []).map((e) => ({ ...e, links: e.links.filter((l) => keep.has(l.ploNumber)) })).filter((e) => e.links.length);
  return (
    <>
      <WeightAdvice chain={chain} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Outcome flow of this course</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Click the course to open its CLOs (left) and GAs (right); click a CLO to see its assessments, a GA to see its PEOs. Figures update as you change the plan.</p>
        <OutcomeFlow mode="course" batchId={chain.course.batchId} canEdit={false} target={flow?.target || 60}
          courses={[{ id: courseId, code: chain.course.code, title: chain.course.title, courseType: "", creditHours: chain.course.creditHours, semesterNumber: null, family: flow?.courses.find((c) => c.id === courseId)?.family || "COMPUTING" }]}
          plos={plos} peos={peos} initialChain={chain} peoNote="No program objective is linked to this course's GAs yet." />
      </div>
    </>
  );
}
