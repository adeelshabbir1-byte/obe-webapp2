import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import { navForRole } from "../../../../../components/reportNav";
import { roleLabel } from "../../../../../lib/reportScope";
import { ActionButton, ActionForm } from "../../../../../components/fyp/FypClient";
import { canBuild } from "../../../../../lib/curriculumBuilder";
import { contactHours, poolBuffer, poolRequired, COUNTED, POOLS } from "../../../../../lib/stageGateCore";
import { GATES_HINT, categoryMap, gateData, seedCategories } from "../../../../../lib/stageGates";
import { cqiFlags } from "../../../../../components/GoldenMeter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Stage-gates" };

// HEC stage-gates for a curriculum: Gate 1 categories and total credit hours, Gate 2 course list and elective choice
// buffers, Gate 3 every course 100% OBE-complete. Publish stays disabled (and is refused on the server) until all pass.
export default async function Gates({ params, searchParams }: { params: { id: string }; searchParams: { course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await prisma.masterCurriculum.findUnique({ where: { id: params.id }, select: { id: true, title: true, version: true, authority: true, status: true, chairmanId: true, parentCurriculumId: true } });
  if (!c) notFound();
  if (!(await canBuild(user as never, c))) redirect(`/curricula/${c.id}`);
  let missing = false;
  const d = await gateData(c.id).catch(() => { missing = true; return null; });
  const editable = c.status !== "PUBLISHED";
  const map = await categoryMap(c.id);
  const seedCats = c.parentCurriculumId ? await seedCategories(c.id) : [];
  const shell = (x: React.ReactNode) => <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (!d) return shell(<div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{missing ? GATES_HINT : "Not found."}</p></div>);
  const r = d.result;
  const Gate = ({ n, title, open, issues, children }: { n: number; title: string; open: boolean; issues: { text: string }[]; children?: React.ReactNode }) => (
    <div className="card" data-gate={n} style={{ borderLeft: `4px solid ${!open ? "#aaa" : issues.length ? "#B3261E" : "#2F7A4D"}` }}>
      <b>Gate {n}: {title}</b> — {!open ? <span className="small-note">locked until the earlier gate passes</span> : issues.length ? <b style={{ color: "#B3261E" }}>{issues.length} to fix</b> : <b style={{ color: "#2F7A4D" }}>passed</b>}
      {open && issues.slice(0, 30).map((i, k) => <p key={k} style={{ margin: "2px 0", fontSize: 13 }}>⛔ {i.text}</p>)}
      {children}
    </div>
  );
  const sel = d.courses.find((x) => x.id === searchParams.course) || null;
  return shell(
    <>
      <p className="small-note" style={{ margin: 0 }}><Link href={`/curricula/builder/${c.id}`}>← Curriculum Builder</Link></p>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>Stage-gates — {c.authority} {c.title} {c.version}</h1>
      <p className="small-note">Publishing{c.chairmanId === null ? " this national curriculum" : ""} is possible only when all three gates pass and every course is 100% compliant ({r.g3.compliant} of {r.g3.total}). {c.status === "PUBLISHED" ? "Published: a read-only Golden Copy." : ""}</p>
      {await cqiFlags(c.id, { canResolve: true })}
      <div className="card" data-testid="publish-state"><b>{r.publishable ? "✅ Ready to publish" : "🔒 Publish is disabled"}</b> <span className="small-note">— {r.g3.compliant} of {r.g3.total} courses compliant</span></div>

      <Gate n={1} title="Categories and total credit hours" open issues={r.g1}>
        <p className="small-note" style={{ margin: "4px 0" }}>Total: <b>{d.totalCredits ?? "not set"}</b> CH · categories: {d.types.filter((t) => COUNTED.includes(t.kind)).map((t) => `${t.name} (${t.minCourses ?? "?"} courses, ${t.minCredits ?? "?"} CH)`).join(" · ")} · edit categories in the builder (step 1).</p>
        {editable && <ActionForm url="/api/curricula/gates" fixed={{ curriculumId: c.id, action: "total" }} submit="Save" collapsed openLabel="Set the total credit hours" initial={{ total: d.totalCredits ?? "" }} fields={[{ name: "total", label: "Total degree credit hours", type: "number", width: 120 }]} />}
      </Gate>
      <Gate n={2} title="Course list and elective choice buffers" open={r.open2} issues={r.g2}>
        {d.types.filter((t) => POOLS.includes(t.kind)).map((p) => { const req = poolRequired(p, d.types, d.courses); return <p key={p.name} className="small-note" style={{ margin: "2px 0" }}>{p.name}: {d.courses.filter((x) => x.category === p.name).length} in the pool · students take {req} · needs ≥ {poolBuffer(req)}</p>; })}
      </Gate>
      <Gate n={3} title="Model course detail (100% OBE checklist)" open={r.open3} issues={r.g3.issues}>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
            <thead><tr><th>Course</th><th>Basic</th><th>Contact h</th><th>CLOs</th><th>Matrix</th><th>Topics</th><th>%</th></tr></thead>
            <tbody>{r.g3.checks.map((x) => { const co = d.courses.find((y) => y.id === x.courseId)!; return (
              <tr key={x.courseId} data-course={co.code}><td><Link href={`?course=${co.id}`}>{co.code} {co.title}</Link></td>{x.parts.map((p) => <td key={p.key} title={p.why.join(" ")} style={{ color: p.ok ? "#2F7A4D" : "#B3261E" }}>{p.ok ? "✓" : "✗"}</td>)}<td><b>{x.pct}%</b></td></tr>); })}</tbody>
          </table>
        </div>
      </Gate>

      {sel && (() => {
        const chk = r.g3.checks.find((x) => x.courseId === sel.id)!;
        const h = contactHours(sel);
        const ploIds = Array.from(new Set(sel.clos.flatMap((x) => x.ploIds)));
        return (
          <div className="card" data-testid="course-detail">
            <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>{sel.code} {sel.title} — {chk.pct}%</h2>
            {chk.parts.filter((p) => !p.ok).map((p) => <p key={p.key} style={{ margin: "2px 0", fontSize: 13 }}>⛔ {p.label}: {p.why.join(" ")}</p>)}
            <p className="small-note">Contact hours: theory {h.theory} CH = {h.theoryPerWeek} h/week ({h.theorySemester} h) · lab {h.lab} CH = {h.labPerWeek} h/week ({h.labSemester} h)</p>
            {editable && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!sel.prerequisiteId && <ActionButton url="/api/curricula/gates" body={{ curriculumId: c.id, action: "noPrereq", masterCourseId: sel.id, on: !sel.noPrereq }} label={sel.noPrereq ? "Prerequisites: none (undo)" : "Mark: no prerequisites"} className="btn btn-secondary btn-sm" />}
                {sel.labCredits > 0 && <ActionForm url="/api/curricula/gates" fixed={{ curriculumId: c.id, action: "lab", masterCourseId: sel.id }} submit="Save week" collapsed openLabel={`Lab plan (${new Set(sel.labWeeks).size}/16 weeks)…`} initial={{ week: (Array.from({ length: 16 }, (_, i) => i + 1).find((w) => !sel.labWeeks.includes(w)) ?? 1) }} fields={[{ name: "week", label: "Week", type: "number", width: 70 }, { name: "experiment", label: "Experiment", type: "text", width: 300 }]} />}
                {ploIds.map((p) => { const cl = sel.clos.filter((x) => x.ploIds.includes(p)); const pl = d.plos.find((x) => x.id === p); return <ActionForm key={p} url="/api/curricula/gates" fixed={{ curriculumId: c.id, action: "weights", masterCourseId: sel.id, ploId: p }} submit="Save weights" collapsed openLabel={`PLO-${pl?.number ?? "?"} weights…`} initial={{ weights: undefined, ...Object.fromEntries(cl.map((x) => [`w_${x.id}`, sel.weights.find((w) => w.cloId === x.id && w.ploId === p)?.pct ?? Math.round(10000 / cl.length) / 100])) }} fields={cl.map((x) => ({ name: `w_${x.id}`, label: `CLO-${x.n} %`, type: "number" as const, width: 80 }))} />; })}
                <ActionForm url="/api/curricula/gates" fixed={{ curriculumId: c.id, action: "dep", masterCourseId: sel.id }} submit="Add" collapsed openLabel="Add a topic dependency…" initial={{ onCourseId: sel.id, lectureNumber: 2, onLecture: 1 }} fields={[{ name: "lectureNumber", label: "This course's lecture", type: "number", width: 90 }, { name: "onCourseId", label: "depends on course", type: "select", options: d.courses.map((x) => [x.id, `${x.code} ${x.title}`] as [string, string]), width: 220 }, { name: "onLecture", label: "lecture", type: "number", width: 80 }]} />
              </div>
            )}
            {d.deps.filter((x) => x.masterCourseId === sel.id).map((x) => <p key={x.id} className="small-note" style={{ margin: "2px 0" }}>L{x.lectureNumber} depends on {d.courses.find((y) => y.id === x.onCourseId)?.code} L{x.onLecture} {editable && <ActionButton url="/api/curricula/gates" body={{ curriculumId: c.id, action: "removeDep", id: x.id }} label="Remove" className="btn btn-secondary btn-sm" />}</p>)}
          </div>
        );
      })()}

      {c.parentCurriculumId && (
        <div className="card">
          <b>Category transition map</b> <span className="small-note">— this revision was seeded from an earlier one. Map the old categories to the new; applying moves the carried-over courses.</span>
          {map.map((m) => <p key={m.fromName} style={{ margin: "2px 0", fontSize: 13 }}>{m.fromName} → <b>{m.toName}</b></p>)}
          {editable && <ActionForm url="/api/curricula/gates" fixed={{ curriculumId: c.id, action: "map" }} submit="Save rule" collapsed openLabel="+ Mapping rule" initial={{ fromName: seedCats[0] || "", toName: d.types[0]?.name || "" }} fields={[{ name: "fromName", label: "Old category", type: "select", options: seedCats.map((x) => [x, x] as [string, string]), width: 220 }, { name: "toName", label: "New category", type: "select", options: d.types.map((t) => [t.name, t.name] as [string, string]), width: 220 }]} />}
          {editable && map.length > 0 && <ActionButton url="/api/curricula/gates" body={{ curriculumId: c.id, action: "applyMap" }} label="Apply the map to the courses" showMessage />}
        </div>
      )}
    </>
  );
}
