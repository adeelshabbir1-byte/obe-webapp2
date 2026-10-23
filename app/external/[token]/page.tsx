import { prisma } from "../../../lib/db";
import { examinerByToken, mdb, repeatCheck } from "../../../lib/moderation";
import { paperOf, type Vetting } from "../../../lib/paperVetting";
import { computeResultMate } from "../../../lib/resultMate";
import { ExternalRemarkForm } from "../../../components/ModerationForms";

export const dynamic = "force-dynamic";

// An outside examiner's view, reached by a link that expires: the final paper and result of each course given to them,
// read-only, with a form for their remarks. No account is needed.
export default async function ExternalExaminerPage({ params }: { params: { token: string } }) {
  const ex = await examinerByToken(params.token);
  const wrap = (x: React.ReactNode) => <main style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px", fontFamily: "system-ui, sans-serif", color: "#241A1D", background: "#F7F4F3", minHeight: "100vh" }}>{x}</main>;
  if (!ex) return wrap(<div className="card" style={{ background: "#fff", padding: 20, borderRadius: 12 }}><h1 style={{ fontSize: 20 }}>This link has expired</h1><p>Please ask the institute for a new one.</p></div>);
  const inst = await prisma.user.findUnique({ where: { id: ex.chairmanId }, select: { instituteName: true } });
  const ids = JSON.parse(ex.courseIdsJson) as string[];
  const courses = await prisma.course.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, code: true, title: true, creditHours: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
  const blocks = await Promise.all(courses.map(async (c) => {
    const v = ((await mdb.paperVetting.findUnique({ where: { courseId_examType: { courseId: c.id, examType: "Final" } } }).catch(() => null)) as Vetting | null);
    const { items, clos } = await paperOf(c.id, "Final").catch(() => ({ items: [], clos: [] } as unknown as Awaited<ReturnType<typeof paperOf>>));
    const code = new Map(clos.map((k) => [k.id, k.code]));
    const qs = v ? (JSON.parse(v.questionsJson) as Record<string, string>) : {};
    const repeats = v ? await repeatCheck(c.id, "Final").catch(() => []) : [];
    const res = await computeResultMate(c.id).catch(() => null);
    const grades = new Map<string, number>(); for (const r of res?.rows || []) grades.set(r.grade, (grades.get(r.grade) || 0) + 1);
    return { c, v, items, code, qs, repeats, res, grades, clos };
  }));
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E6DADC", borderRadius: 12, padding: 16, marginBottom: 14 };
  return wrap(<>
    <div style={{ height: 5, background: "#7E2435", borderRadius: 3, marginBottom: 12 }} />
    <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>External examination — {inst?.instituteName || "Institute"}</h1>
    <p style={{ fontSize: 13.5, color: "#5C5356", margin: "0 0 14px" }}>Welcome, {ex.name}. Below are the final papers and results of the courses you were asked to examine. Everything is read-only; please send your remarks for each. This link works until {new Date(ex.expiresAt).toLocaleDateString("en-GB")}.</p>
    {blocks.map(({ c, v, items, code, qs, repeats, res, grades, clos }) => (
      <section key={c.id} style={card}>
        <h2 style={{ fontSize: 18, margin: "0 0 2px" }}>{c.code} {c.title}</h2>
        <p style={{ fontSize: 12.5, color: "#5C5356", margin: "0 0 10px" }}>{c.batch?.degreeProgram} {c.batch?.batchName} · {c.creditHours} credit hours · teacher {c.instructor?.name || "—"}</p>
        <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>Final paper</h3>
        {!items.length ? <p style={{ fontSize: 13 }}>The final paper has not been set in OBEHUB yet.</p> : <>
          {items.map((i) => <div key={i.id} style={{ fontSize: 13.5, margin: "6px 0" }}><b>Q{i.questionNo}</b> <span style={{ color: "#5C5356", fontSize: 12 }}>{(i.cloId && code.get(i.cloId)) || "no CLO"} · {i.cognitiveLevel || "—"} · {i.marks} marks</span><div style={{ whiteSpace: "pre-wrap" }}>{qs[i.id] || <i style={{ color: "#8A8184" }}>question text not entered</i>}</div></div>)}
          <p style={{ fontSize: 12.5, color: "#5C5356" }}>CLOs: {clos.map((k) => `${k.code} (${k.bloomLevel})`).join(" · ")}{v?.status ? ` · internal vetting: ${v.status.toLowerCase()}` : ""}{repeats.length ? ` · ${repeats.length} question(s) resemble past papers` : ""}</p>
          <ExternalRemarkForm token={params.token} courseId={c.id} kind="PAPER" />
        </>}
        <h3 style={{ fontSize: 15, margin: "14px 0 4px" }}>Result</h3>
        {!res || !res.rows.length ? <p style={{ fontSize: 13 }}>No result yet.</p> : <>
          <p style={{ fontSize: 13.5 }}>{res.rows.length} students · class average {res.stats.mean}% (SD {res.stats.sd}) · grades: {Array.from(grades.entries()).map(([g, n]) => `${g} ${n}`).join(", ")}</p>
          <ExternalRemarkForm token={params.token} courseId={c.id} kind="RESULT" />
        </>}
      </section>
    ))}
  </>);
}
