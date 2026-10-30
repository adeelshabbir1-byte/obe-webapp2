import { prisma } from "../lib/db";
import { labTasks, theoryLectures } from "../lib/labPlanCore";
import { labCloOptions } from "../lib/labSessions";
import { labAhead } from "../lib/cloMethodCore";
import { ActionButton, ActionForm } from "./fyp/FypClient";

// The lab plan, week by week beside the theory: each lab row is one session (default 15 rows × 3 hours), with its lab
// CLO, tools, deliverable, lab mid / final, and the theory topics it practises. Green = in sync, red = lab ahead of the
// lecture that teaches it, grey = not linked. A lab row ahead of its theory blocks the plan unless the SE gives a reason.

const db = prisma as unknown as Record<string, any>;
type Meta = { labNumber: number; hours: number; cloId: string | null; tools: string | null; deliverable: string | null; labOnly: boolean; kind: string; aheadReason: string | null; bestOf: string | null };

export default async function LabSyncExtras({ labCourseId, theoryId, canEdit }: { labCourseId: string; theoryId: string | null; canEdit: boolean }) {
  const [tasks, lectures, metas, clos] = await Promise.all([
    labTasks(labCourseId), theoryLectures(theoryId), db.labRowMeta.findMany({ where: { labCourseId } }).catch(() => []) as Promise<Meta[]>,
    labCloOptions(labCourseId, theoryId).catch(() => [] as { id: string; code: string }[]),
  ]);
  const meta = new Map(metas.map((m) => [m.labNumber, m]));
  const rows = tasks.map((t) => ({ week: t.week ?? 0, labNumber: t.labNumber, hours: meta.get(t.labNumber)?.hours ?? 3, title: t.title, topics: t.topics, cloId: meta.get(t.labNumber)?.cloId || null, tools: "", deliverable: "", labOnly: !!meta.get(t.labNumber)?.labOnly, kind: "TASK" as const }));
  const ahead = labAhead(rows.filter((r) => r.week), lectures);
  const practice = theoryId ? ((await db.topicPractice.findMany({ where: { courseId: theoryId } }).catch(() => [])) as { lectureRowId: string; needsPractice: boolean }[]) : [];
  const lrs = theoryId ? await prisma.lectureRow.findMany({ where: { courseId: theoryId, source: (await prisma.lectureRow.count({ where: { courseId: theoryId, source: "INSTRUCTOR" } })) ? "INSTRUCTOR" : "SE" }, select: { id: true, lectureNumber: true, topic: true }, orderBy: { lectureNumber: "asc" } }) : [];
  const needs = new Set(practice.filter((p) => p.needsPractice).map((p) => p.lectureRowId));
  const weeks = Math.max(15, ...rows.map((r) => r.week), ...lectures.map((l) => l.week));
  const colour = (r: (typeof rows)[number]) => (r.labOnly ? "#777" : !r.topics.length ? "#999" : ahead.some((a) => a.labNumber === r.labNumber) ? "#B3261E" : "#2F7A4D");
  const cloCode = (id: string | null) => clos.find((c) => c.id === id)?.code || null;

  return (
    <div className="card" style={{ overflowX: "auto" }} data-testid="lab-sync">
      <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Theory–lab sync, week by week</h2>
      <p className="small-note" style={{ margin: "0 0 6px" }}>A topic is taught in theory first, then practised in the lab: the lecture&apos;s week must be the same week or earlier. <span style={{ color: "#2F7A4D" }}>Green</span> in sync · <span style={{ color: "#B3261E" }}>red</span> lab ahead of theory · <span style={{ color: "#999" }}>grey</span> not linked. Checked again whenever either plan changes.</p>
      {!tasks.length && canEdit && <ActionButton url="/api/clo-method" body={{ action: "labDefaults", labCourseId }} label="Start with 15 weekly 3-hour sessions" />}
      {tasks.length > 0 && (
        <table className="table" style={{ width: "100%", fontSize: 12 }}>
          <thead><tr><th>Week</th><th>Theory</th><th>Lab</th></tr></thead>
          <tbody>{Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
            const ls = lectures.filter((l) => l.week === w), rs = rows.filter((r) => r.week === w);
            if (!ls.length && !rs.length) return null;
            return (
              <tr key={w}><td>{w}</td>
                <td>{ls.map((l) => <div key={l.lectureNumber}>L{l.lectureNumber} {l.topic}</div>)}</td>
                <td>{rs.map((r) => { const m = meta.get(r.labNumber); const a = ahead.find((x) => x.labNumber === r.labNumber); return (
                  <div key={r.labNumber} style={{ borderLeft: `3px solid ${colour(r)}`, paddingLeft: 6, marginBottom: 3 }}>
                    <b>Lab {r.labNumber}</b> {r.title} · {r.hours} h{m?.kind === "MID" ? " · lab mid" : m?.kind === "FINAL" ? " · lab final" : ""}{cloCode(r.cloId) ? ` · ${cloCode(r.cloId)}` : ""}{m?.bestOf ? ` · best-of group ${m.bestOf}` : ""}{r.labOnly ? " · lab-only" : ""}
                    {r.topics.length > 0 && <div className="small-note">practises {r.topics.map((t) => t.topic).join(", ")}</div>}
                    {a && <div style={{ color: "#B3261E" }}>{a.text}{m?.aheadReason ? ` — reason: ${m.aheadReason}` : " — move the lab row (Week) or the lecture, or give a reason"}</div>}
                  </div>); })}</td></tr>
            );
          })}</tbody>
        </table>
      )}
      {canEdit && tasks.length > 0 && (
        <ActionForm url="/api/clo-method" fixed={{ action: "labRow", labCourseId }} submit="Save row" done="Saved." collapsed openLabel="Edit a lab row (hours, CLO, tools, deliverable, mid / final, reason)…" initial={{ labNumber: String(tasks[0].labNumber), hours: 3, kind: "TASK" }}
          fields={[{ name: "labNumber", label: "Lab", type: "select", options: tasks.map((t) => [String(t.labNumber), `Lab ${t.labNumber} ${t.title}`] as [string, string]), width: 200 }, { name: "hours", label: "Session hours", type: "number", width: 90 },
            { name: "cloId", label: "Lab CLO", type: "select", options: [["", "—"], ...clos.map((c) => [c.id, c.code] as [string, string])], width: 110 }, { name: "kind", label: "Kind", type: "select", options: [["TASK", "Weekly task"], ["MID", "Lab mid"], ["FINAL", "Lab final"]] },
            { name: "tools", label: "Tools / software", type: "text", width: 160 }, { name: "deliverable", label: "Deliverable", type: "text", width: 160 }, { name: "bestOf", label: "Best-of group (e.g. A: best 8 of 10)", type: "text", width: 200 },
            { name: "labOnly", label: "Lab-only (no theory link, e.g. tool set-up)", type: "checkbox" }, { name: "aheadReason", label: "Reason if ahead of theory", type: "text", width: 260 }]} />
      )}
      {canEdit && lrs.length > 0 && (
        <ActionForm url="/api/clo-method" fixed={{ action: "practice", courseId: theoryId }} submit="Save" done="Saved." collapsed openLabel={`Theory topics that need practice (${needs.size})…`} initial={{ lectureRowId: lrs[0].id, needsPractice: true }}
          fields={[{ name: "lectureRowId", label: "Lecture", type: "select", options: lrs.map((l) => [l.id, `L${l.lectureNumber} ${l.topic}${needs.has(l.id) ? " ✓" : ""}`] as [string, string]), width: 300 }, { name: "needsPractice", label: "Needs practice in the lab", type: "checkbox" }]} />
      )}
    </div>
  );
}
