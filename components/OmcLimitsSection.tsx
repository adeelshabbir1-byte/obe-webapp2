import { prisma } from "../lib/db";
import { ActionButton, ActionForm } from "./fyp/FypClient";
import { CATEGORIES, HEADS, HEAD_LABEL, DEFAULT_FIGURES, figuresLine, limitsOf, roundsOf, opinionsOf, isConvener, allMembers, panelsOf, overdueRequests, OVERDUE_DAYS, type Figures } from "../lib/omcRules";

// The OMC's assessment limits per course category, set in rounds: the Convener opens them for comments, each member
// gives figures and a comment per category, the Convener sees the opinions side by side with today's figures and
// finalises each category (locked until reopened). Below: the semester panels and the requests waiting too long.
const figFields = () => [
  ...HEADS.flatMap((h) => [{ name: `${h}Min`, label: `${HEAD_LABEL[h]} min %`, type: "number" as const, width: 90 }, { name: `${h}Max`, label: `${HEAD_LABEL[h]} max %`, type: "number" as const, width: 90 }]),
  { name: "minQuizzes", label: "Min quizzes", type: "number" as const, width: 90 }, { name: "minAssignments", label: "Min assignments", type: "number" as const, width: 110 },
];
const initialOf = (f: Figures) => Object.fromEntries([...HEADS.flatMap((h) => [[`${h}Min`, f[h]?.[0] ?? ""], [`${h}Max`, f[h]?.[1] ?? ""]]), ["minQuizzes", f.minQuizzes ?? ""], ["minAssignments", f.minAssignments ?? ""]]);

export default async function OmcLimitsSection({ chairmanId, me, canAct }: { chairmanId: string; me: string; canAct: boolean }) {
  const [limits, rounds, convener, members] = await Promise.all([limitsOf(chairmanId), roundsOf(chairmanId), isConvener(chairmanId, me), allMembers(chairmanId)]);
  const open = rounds.find((r) => r.status === "OPEN") || null;
  const ops = open ? await opinionsOf(open.id) : [];
  const names = new Map(members.map((m) => [m.id, m.name]));
  const isMember = members.some((m) => m.id === me);
  const panels = await panelsOf(chairmanId);
  const panelCourses = panels.length ? await prisma.course.findMany({ where: { id: { in: panels.flatMap((p) => p.courseIds) } }, select: { id: true, code: true } }) : [];
  const overdue = convener ? await overdueRequests(chairmanId) : [];
  const memberOptions: [string, string][] = [["", "—"], ...members.map((m) => [m.id, m.name] as [string, string])];
  return (
    <>
      <div className="card" id="limits" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Assessment limits by course category</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Subject Expert plans and teachers&apos; changes are checked against the locked limits. {open ? <b>Open for comments since {new Date(open.openedAt).toLocaleDateString("en-GB")}: {open.categories.map((c) => CATEGORIES.find((k) => k.key === c)?.label).join(", ")}.</b> : "Not open for comments."}</p>
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Category</th><th>Today&apos;s figures</th><th>State</th><th>History</th></tr></thead>
          <tbody>{CATEGORIES.map((k) => { const l = limits.get(k.key); return (
            <tr key={k.key}><td><b>{k.label}</b></td><td>{l ? figuresLine(l.figures) : <span className="small-note" style={{ margin: 0 }}>not set (suggested: {figuresLine(DEFAULT_FIGURES[k.key])})</span>}</td>
              <td>{l ? (l.locked ? <span style={{ color: "#2E7D32", fontWeight: 700 }}>locked {l.lockedAt ? new Date(l.lockedAt).toLocaleDateString("en-GB") : ""}</span> : <span style={{ color: "#B26A00", fontWeight: 700 }}>open for comments</span>) : "—"}</td>
              <td>{l?.history.length ? <details><summary className="small-note" style={{ cursor: "pointer" }}>{l.history.length} decision(s)</summary><ul style={{ paddingLeft: 16, margin: 0 }}>{l.history.slice().reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleDateString("en-GB")} · {h.byName}: {figuresLine(h.figures)}</li>)}</ul></details> : "—"}</td></tr>); })}</tbody></table>
        {canAct && convener && !open && <ActionForm url="/api/omc/omc-rules" fixed={{ action: "open" }} submit="Open for comments" collapsed openLabel="Open the limits for comments" initial={{ categories: "ALL" }}
          fields={[{ name: "categories", label: "Which categories", type: "select", width: 220, options: [["ALL", "All categories"], ...CATEGORIES.map((k) => [k.key, k.label] as [string, string])] }]} />}
        {open && open.categories.map((cat) => {
          const label = CATEGORIES.find((k) => k.key === cat)?.label || cat;
          const now = limits.get(cat)?.figures || null;
          const mine = ops.find((o) => o.category === cat && o.memberId === me);
          const these = ops.filter((o) => o.category === cat);
          return (
            <div key={cat} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 8 }}>
              <b>{label}</b> <span className="small-note" style={{ margin: 0 }}>· {these.length} of {members.length} opinion(s){members.filter((m) => !these.some((o) => o.memberId === m.id)).length ? ` · waiting: ${members.filter((m) => !these.some((o) => o.memberId === m.id)).map((m) => m.name).join(", ")}` : ""}</span>
              <table className="table" style={{ fontSize: 12, marginTop: 4 }}><thead><tr><th>Who</th>{HEADS.map((h) => <th key={h}>{HEAD_LABEL[h]}</th>)}<th>Min quizzes / assignments</th><th>Comment</th></tr></thead>
                <tbody>
                  <tr style={{ background: "var(--paper)" }}><td><i>Today</i></td>{HEADS.map((h) => <td key={h}>{now?.[h] ? `${now[h]![0] ?? 0}–${now[h]![1] ?? 100}` : "—"}</td>)}<td>{now ? `${now.minQuizzes ?? "—"} / ${now.minAssignments ?? "—"}` : "—"}</td><td /></tr>
                  {these.map((o) => <tr key={o.memberId}><td>{names.get(o.memberId) || "—"}</td>{HEADS.map((h) => <td key={h}>{o.figures[h] ? `${o.figures[h]![0] ?? 0}–${o.figures[h]![1] ?? 100}` : "—"}</td>)}<td>{o.figures.minQuizzes ?? "—"} / {o.figures.minAssignments ?? "—"}</td><td>{o.comment || ""}</td></tr>)}
                </tbody></table>
              {canAct && isMember && <ActionForm url="/api/omc/omc-rules" fixed={{ action: "opinion", category: cat }} submit="Save my opinion" collapsed openLabel={mine ? "Change my opinion" : "Give my opinion"} initial={{ ...initialOf(mine?.figures || now || DEFAULT_FIGURES[cat]), comment: mine?.comment || "" }} fields={[...figFields(), { name: "comment", label: "Comment", type: "textarea", full: true }]} />}
              {canAct && convener && <ActionForm url="/api/omc/omc-rules" fixed={{ action: "finalise", category: cat }} submit={`Finalise ${label}`} collapsed openLabel={`Decide and finalise ${label}`} initial={initialOf(now || DEFAULT_FIGURES[cat])} fields={figFields()} />}
            </div>
          );
        })}
        {rounds.length > 0 && <details style={{ marginTop: 8 }}><summary className="small-note" style={{ cursor: "pointer" }}>Rounds ({rounds.length})</summary><ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{rounds.map((r) => <li key={r.id}>{new Date(r.openedAt).toLocaleDateString("en-GB")}{r.closedAt ? ` – ${new Date(r.closedAt).toLocaleDateString("en-GB")}` : " – open"}: {r.categories.map((c) => CATEGORIES.find((k) => k.key === c)?.label).join(", ")}</li>)}</ul></details>}
      </div>
      <div className="card" id="panels" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Requests during the semester</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Weight exceptions and plan / topic changes: two OMC approvals approve at once (the requester is told); two rejections with reasons reject. Or the Convener gives courses a three-member panel for the semester — then only the panel votes, two of three deciding. Requests waiting more than {OVERDUE_DAYS} days are flagged to the Convener.</p>
        {panels.length === 0 ? <p className="small-note">No panels — requests go to the whole OMC.</p> : (
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Semester</th><th>Panel</th><th>Members</th><th>Courses</th>{convener && <th />}</tr></thead>
            <tbody>{panels.map((p) => <tr key={p.id}><td>{p.term}</td><td>{p.label || "—"}</td><td>{p.memberIds.map((id) => names.get(id) || "—").join(", ")}</td><td>{p.courseIds.map((id) => panelCourses.find((c) => c.id === id)?.code || "?").join(", ")}</td>{convener && <td><ActionButton url="/api/omc/omc-rules" body={{ action: "deletePanel", id: p.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove this panel? Its courses' requests go to the whole OMC again." /></td>}</tr>)}</tbody></table>)}
        {canAct && convener && <ActionForm url="/api/omc/omc-rules" fixed={{ action: "panel" }} submit="Save panel" collapsed openLabel="+ Add a panel" initial={{}}
          fields={[{ name: "term", label: "Semester (e.g. Spring 2027)", width: 160 }, { name: "label", label: "Name (optional)", width: 180 }, { name: "member1", label: "Member 1", type: "select", options: memberOptions, width: 170 }, { name: "member2", label: "Member 2", type: "select", options: memberOptions, width: 170 }, { name: "member3", label: "Member 3", type: "select", options: memberOptions, width: 170 }, { name: "courses", label: "Course codes (comma separated)", type: "textarea", full: true }]} />}
        {convener && overdue.length > 0 && <div style={{ marginTop: 10 }}><b style={{ color: "#C62828" }}>Waiting more than {OVERDUE_DAYS} days ({overdue.length})</b>
          <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: "4px 0" }}>{overdue.map((o) => <li key={o.kind + o.id}><a href={o.kind === "WEIGHT" ? "/omc/weight-exceptions" : "/omc/template-changes"}>{o.kind === "WEIGHT" ? "Weight exception" : "Plan change"} · {o.course}</a> · {o.days} days · {o.votes}</li>)}</ul></div>}
      </div>
    </>
  );
}
