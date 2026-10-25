import { courseChain, cachedBatchFlow } from "../lib/outcomeFlow";
import CourseGaFlow from "./CourseGaFlow";
import WeightAdvice from "./WeightAdvice";

// One course plan's flow, left to right: Assessments → CLOs → GAs → Course, with the weight advice.
export default async function CourseFlowPanel({ courseId, source }: { courseId: string; source?: "SE" | "INSTRUCTOR" }) {
  const chain = await courseChain(courseId, source);
  if (!chain) return null;
  const flow = chain.course.batchId ? await cachedBatchFlow(chain.course.batchId) : null;
  const ploNumbers = new Set(chain.clos.map((c) => c.ploNumber).filter((n): n is number => n !== null));
  const gas = (flow?.plos || [])
    .filter((p) => p.courses.some((c) => c.id === courseId) || ploNumbers.has(p.number))
    .map((p) => ({ number: p.number, title: p.title, attainment: p.attainment, weight: p.courses.find((c) => c.id === courseId)?.weight ?? null }));
  return (
    <>
      <WeightAdvice chain={chain} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Outcome flow of this course</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Assessments → CLOs → GAs, each CLO linked to its GA. Click a CLO to see only its assessments, sorted by contribution. Pick a GA to see only the CLOs that map to it and the assessments that assess them. Amber = a gap (a CLO with no assessment or no GA, or a GA no CLO maps to).</p>
        <CourseGaFlow target={flow?.target || chain.criteria?.cloPct || 60}
          course={{ code: chain.course.code, title: chain.course.title, creditHours: chain.course.creditHours }}
          clos={chain.clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloom: c.bloom, ploNumber: c.ploNumber, weight: c.weight, attainment: c.attainment, avg: c.avg, contribution: c.contribution }))}
          edit={source ? { courseId, source } : undefined}
          assessments={chain.assessments.map((a) => ({ id: a.id, type: a.type, label: a.label, marksPct: a.marksPct, cloId: a.cloId, reached: a.reached, share: a.share }))}
          gas={gas} />
      </div>
    </>
  );
}
