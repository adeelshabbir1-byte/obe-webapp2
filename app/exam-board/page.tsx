import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import PrintButton from "../../components/PrintButton";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { DraftPicker, LeadPick, QuestionForm, Stars } from "../../components/ExamBoardClient";
import { loadTeams, type Team } from "../../lib/courseTeams";
import { BLUEPRINT_ROLES, EB_HINT, canView, hrefOf, isTeacher, round, type Round } from "../../lib/examBoard";
import { BLOOM_NAMES, EXAMS, mappingTable, type PaperQ } from "../../lib/examBoardCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Team exam papers" };

const TABS: [string, string][] = [["bank", "Question bank"], ["draft", "My draft"], ["review", "Review & rate"], ["consensus", "Consensus paper"], ["paper", "Official paper"]];
const dLabel = (d: string | null) => (d ? d[0] + d.slice(1).toLowerCase() : "—");
const stars = (a: number | null) => (a === null ? "not rated" : `${a.toFixed(2)} ★`);

// Shared courses taught by several teachers: a common question bank, each teacher's draft paper checked against the
// exam blueprint, 5-star peer ratings, the consensus paper and the Course Lead's official paper.
export default async function ExamBoardPage({ searchParams }: { searchParams: { team?: string; exam?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const teams = (await loadTeams(chairmanId).catch(() => [] as Team[])).filter((t) => canView(t, user));
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const team = teams.find((t) => t.key === searchParams.team) || null;
  const names = new Map(teams.flatMap((t) => t.teachers.map((x) => [x.id, x.name] as [string, string])));

  if (!team) {
    const finals = (await (prisma as unknown as Record<string, any>).examFinal.findMany({ where: { chairmanId, teamKey: { in: teams.map((t) => t.key) } } }).catch(() => null)) as { teamKey: string; examType: string; status: string }[] | null;
    return shell(<>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Team exam papers</h1>
      <p className="small-note">Courses taught in several sections by different teachers. Every teacher adds questions to the shared bank and drafts a paper; the team rates each other&apos;s questions; the highest-rated questions make the consensus paper, and the Course Lead breaks ties and publishes the official paper to every section.</p>
      {finals === null && <div className="err">{EB_HINT}</div>}
      {!teams.length && <div className="card"><p style={{ margin: 0 }}>No course teams this term — a team is the same course (or an equivalence group) taught by two or more teachers.</p></div>}
      {teams.map((t) => (
        <div key={t.key} className="card" data-team={t.code}>
          <b>{t.code} {t.title}</b> <span className="small-note">{t.term} · {t.rows.length} section(s) · {t.teachers.map((x) => x.name).join(", ")} · Course Lead: {t.leadId ? names.get(t.leadId) || "—" : <i>not named yet</i>}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>{EXAMS.map((e) => { const f = finals?.find((x) => x.teamKey === t.key && x.examType === e); return <Link key={e} className="btn btn-secondary btn-sm" href={hrefOf(t.key, e)}>{e}{f?.status === "PUBLISHED" ? " — published" : ""}</Link>; })}</div>
        </div>
      ))}
    </>);
  }

  const examType = EXAMS.includes(searchParams.exam as never) ? searchParams.exam! : "Midterm";
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "bank";
  let r: Round | null = null, missing = false;
  try { r = await round(chairmanId, team, examType); } catch { missing = true; }
  const teacher = isTeacher(team, user.id), lead = team.leadId === user.id;
  const T = (k: string, l: string) => <Link key={k} href={hrefOf(team.key, examType, k)} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>;
  const head = (
    <>
      <p className="small-note" style={{ marginBottom: 2 }}><Link href="/exam-board">← All course teams</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{team.code} {team.title} — {examType}</h1>
      <p className="small-note">{team.term} · {team.rows.length} section(s): {team.rows.map((x) => x.batch).join("; ")} · Course Lead: {team.leadId ? <b>{names.get(team.leadId)}</b> : <i>not named yet (the HOD, Chairman or course assigner names one on Course Leads)</i>}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {EXAMS.map((e) => <Link key={e} href={hrefOf(team.key, e, tab)} className={`btn btn-sm ${e === examType ? "btn-brass" : "btn-secondary"}`}>{e}</Link>)}
        <span style={{ width: 12 }} />
        {TABS.map(([k, l]) => T(k, l))}
      </div>
    </>
  );
  if (!r || missing) return shell(<>{head}<div className="err">{EB_HINT}</div></>);
  const R = r;
  const plan = R.plan;
  const status = R.published ? <div className="card" style={{ borderLeft: "5px solid #2F7A4D" }} data-testid="published-banner"><b>Published</b> — the official {examType.toLowerCase()} paper is locked{R.final?.publishedAt ? ` (${new Date(R.final.publishedAt).toISOString().slice(0, 10)})` : ""}. Ratings and drafts are closed.</div> : null;
  const qMeta = (q: { lectureNumber: number | null; week: number | null; cloCodes: string[]; difficulty: string | null; bloom: string; marks: number; authorId: string }) => <span className="small-note">[{q.lectureNumber !== null ? `W${q.week} L${q.lectureNumber}` : "no topic"} · {q.cloCodes.join(", ") || "no CLO"} · {dLabel(q.difficulty)} · {q.bloom} {BLOOM_NAMES[q.bloom] || ""} · {q.marks} marks · {names.get(q.authorId) || "—"}]</span>;
  const drafted = `${R.submitted.length} of ${team.teachers.length} draft(s) submitted`;

  return shell(<>
    {head}
    {status}
    <p className="small-note" data-testid="round-status">{drafted} · {R.proposed.length} proposed question(s) · blueprint: Easy {R.bp.easyPct}% / Medium {R.bp.mediumPct}% / Hard {R.bp.hardPct}% (± {R.bp.tolerancePct}), each CLO {R.bp.minCloPct}–{R.bp.maxCloPct}%</p>

    {tab === "bank" && <>
      {teacher && <div className="card"><QuestionForm scope={{ team: team.key }} lectures={plan.lectures} clos={plan.clos} examType={R.published ? undefined : examType} /></div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <b>{R.bank.length} question(s) in the bank for {plan.codes.join(", ")}</b>
        <table className="table" style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}>
          <thead><tr><th>Question</th><th>Topic</th><th>CLOs</th><th>Difficulty</th><th>Bloom</th><th>Marks</th><th>By</th><th>Used</th><th></th></tr></thead>
          <tbody>{R.bank.map((q) => (
            <tr key={q.id} data-bank={q.id}>
              <td style={{ whiteSpace: "pre-wrap", maxWidth: 440 }}>{q.text}{q.codeSnippet && <pre style={{ fontSize: 11, background: "var(--bg-soft, #f6f6f6)", padding: 6, overflowX: "auto" }}>{q.codeSnippet}</pre>}{q.options.length > 0 && <ol type="a" style={{ margin: "4px 0" }}>{q.options.map((o, i) => <li key={i} style={{ fontWeight: i === q.correctIndex ? 600 : 400 }}>{o}</li>)}</ol>}{q.hasImage && <div><img src={`/api/exam-board?image=${q.id}`} alt="Diagram" style={{ maxWidth: 260, maxHeight: 180 }} /></div>}{!q.complete && <div className="small-note" style={{ color: "#B76E00" }}>Metadata missing — its author completes it before it can be used.</div>}</td>
              <td>{q.lectureNumber !== null ? `W${q.week} L${q.lectureNumber} ${q.topic.slice(0, 40)}` : "—"}</td><td>{q.cloCodes.join(", ") || "—"}</td><td>{dLabel(q.difficulty)}</td><td>{q.bloom}</td><td>{q.marks}</td><td>{names.get(q.authorId) || "—"}</td><td>{q.usedCount}</td>
              <td>{q.authorId === user.id && <QuestionForm scope={{ team: team.key }} lectures={plan.lectures} clos={plan.clos} initial={{ id: q.id, text: q.text, marks: q.marks, kind: q.kind, bloom: q.bloom, difficulty: q.difficulty, cloCodes: q.cloCodes, lectureNumber: q.lectureNumber, rubric: q.rubric, options: q.options, correctIndex: q.correctIndex, codeSnippet: q.codeSnippet, hasImage: q.hasImage }} />}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>}

    {tab === "draft" && <>
      {BLUEPRINT_ROLES.includes(user.role) && <div className="card"><b>Exam blueprint ({examType}, whole institute)</b>
        <ActionForm url="/api/exam-board" fixed={{ action: "blueprint", exam: examType }} submit="Save blueprint" collapsed openLabel="Change the blueprint" showMessage initial={{ ...R.bp }}
          fields={[{ name: "easyPct", label: "Easy %", type: "number", width: 70 }, { name: "mediumPct", label: "Medium %", type: "number", width: 70 }, { name: "hardPct", label: "Hard %", type: "number", width: 70 }, { name: "tolerancePct", label: "± tolerance", type: "number", width: 70 }, { name: "minCloPct", label: "CLO min %", type: "number", width: 70 }, { name: "maxCloPct", label: "CLO max %", type: "number", width: 70 }]} /></div>}
      {teacher ? (
        <div className="card">
          <p className="small-note" style={{ marginTop: 0 }}>Choose questions from the bank (or add new ones on the Question bank tab — they go into the shared bank). The paper must meet the blueprint before it can be submitted for peer review. Required CLOs for the {examType.toLowerCase()}: {R.ctx.requiredClos.join(", ") || "none set in the lecture plan"}{R.ctx.minQuestions ? ` · at least ${R.ctx.minQuestions} questions (OMC)` : ""}.</p>
          <DraftPicker team={team.key} examType={examType} bp={R.bp} ctx={R.ctx} locked={R.published} status={R.drafts.find((d) => d.authorId === user.id)?.status || null}
            chosen={JSON.parse(R.drafts.find((d) => d.authorId === user.id)?.itemIdsJson || "[]")}
            bank={R.bank.map((q) => ({ id: q.id, text: q.text, marks: q.marks, difficulty: q.difficulty, cloCodes: q.cloCodes, bloom: q.bloom, lectureNumber: q.lectureNumber, week: q.week, topic: q.topic, mine: q.authorId === user.id, complete: q.complete }))} />
        </div>
      ) : <div className="card"><p style={{ margin: 0 }}>Only the teachers of this course team draft papers.</p></div>}
      <div className="card"><b>Drafts</b>{team.teachers.map((x) => { const d = R.drafts.find((y) => y.authorId === x.id); return <p key={x.id} style={{ margin: "2px 0", fontSize: 13 }}>{x.name}: {d ? `${JSON.parse(d.itemIdsJson).length} question(s) — ${d.status === "SUBMITTED" ? "submitted" : "draft"}` : "not started"}</p>; })}</div>
    </>}

    {tab === "review" && <div className="card" data-testid="review">
      <b>Proposed questions — rate each 1–5 stars</b>
      <p className="small-note">1–2 stars: poor wording, wrong answer or off-topic (say why) · 3: acceptable, needs rephrasing · 4–5: clear and well aligned with its CLO and difficulty. You don&apos;t rate your own questions.</p>
      {!R.proposed.length && <p className="small-note">No draft has been submitted yet.</p>}
      {R.candidates.slice().sort((a, b) => (a.cloCodes[0] || "").localeCompare(b.cloCodes[0] || "") || (a.lectureNumber ?? 0) - (b.lectureNumber ?? 0)).map((q) => {
        const rs = R.rated.get(q.id) || [];
        const mine = rs.find((x) => x.raterId === user.id) || null;
        return (
          <div key={q.id} data-proposed={q.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{q.text}</div>
            <div>{qMeta(q)} <b data-avg={q.id}>{stars(q.avg)}</b> <span className="small-note">({q.n} rating{q.n === 1 ? "" : "s"})</span></div>
            {rs.length > 0 && <div className="small-note">{rs.map((x) => `${names.get(x.raterId) || "—"}: ${x.stars}★${x.comment ? ` “${x.comment}”` : ""}`).join(" · ")}</div>}
            {teacher && !R.published && q.authorId !== user.id && <Stars team={team.key} examType={examType} itemId={q.id} mine={mine ? { stars: mine.stars, comment: mine.comment } : null} />}
          </div>
        );
      })}
    </div>}

    {tab === "consensus" && <>
      <div className="card" data-testid="consensus-check" style={{ borderLeft: `5px solid ${R.check.ok ? "#2F7A4D" : "#B3261E"}` }}>
        <b>Consensus paper — {R.paper.length} question(s), {R.check.total} marks</b> <span className="small-note">{R.fromPlan ? "Slots from the team's question plan (the Course Lead's paper distribution)." : "Slots per CLO, from the drafts."} The highest average rating wins each slot; equal top ratings go to the Course Lead.</span>
        <p style={{ margin: "4px 0", fontSize: 13 }}>Easy {R.check.mix.EASY}% · Medium {R.check.mix.MEDIUM}% · Hard {R.check.mix.HARD}% · {R.check.perClo.map((p) => `${p.code} ${p.pct}%`).join(" · ")}</p>
        {R.check.fails.map((x, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B3261E" }}>⛔ {x}</p>)}
        {R.check.warns.map((x, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B76E00" }}>⚠ {x}</p>)}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 12.5, width: "100%" }}>
          <thead><tr><th>Slot</th><th>Status</th><th>Question</th><th>Rating</th>{lead && !R.published && <th>Course Lead</th>}</tr></thead>
          <tbody>{R.picks.map((p) => {
            const q = p.itemId ? R.byId.get(p.itemId) : null;
            const cand = (id: string) => R.candidates.find((c) => c.id === id);
            const badge = { AUTO: ["Highest rated", "#2F7A4D"], LEAD: ["Course Lead's choice", "#1F5FAD"], TIE: ["Tie — Course Lead decides", "#B76E00"], UNRATED: ["Not rated yet", "#888"], EMPTY: ["No proposed question", "#B3261E"] }[p.status];
            const opts = p.ranked.map((x) => ({ id: x.id, label: `${stars(x.avg)} · ${R.byId.get(x.id)?.text.slice(0, 70)}` }));
            return (
              <tr key={p.slot.key} data-slot={p.slot.key} data-status={p.status}>
                <td>{p.slot.label}{p.slot.marks !== null ? ` (${p.slot.marks} marks)` : ""}</td>
                <td><span style={{ color: badge[1], fontWeight: 600 }}>{badge[0]}</span>{R.decisions[p.slot.key]?.note && <div className="small-note">“{R.decisions[p.slot.key].note}”</div>}</td>
                <td style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>{q ? <>{R.edits[q.id]?.text ?? q.text}{R.edits[q.id] && <span className="small-note"> (adjusted by the Course Lead)</span>}<div>{qMeta(q)}</div></> : p.status === "TIE" ? p.tied.map((id) => <div key={id} style={{ marginBottom: 4 }}>• {R.byId.get(id)?.text.slice(0, 160)} <b>{stars(cand(id)?.avg ?? null)}</b>{lead && !R.published && <> <ActionButton url="/api/exam-board" body={{ action: "lead", team: team.key, exam: examType, op: "pick", slot: p.slot.key, itemId: id }} label="Choose this" className="btn btn-secondary btn-sm" /></>}</div>) : "—"}</td>
                <td>{q ? stars(cand(q.id)?.avg ?? null) : ""}</td>
                {lead && !R.published && <td style={{ minWidth: 220 }}>
                  {p.status !== "TIE" && <LeadPick team={team.key} examType={examType} slot={p.slot.key} options={opts} current={p.itemId} top={p.status === "AUTO" ? p.itemId : p.ranked[0]?.avg !== null && p.ranked[0]?.avg !== p.ranked[1]?.avg ? p.ranked[0]?.id ?? null : null} />}
                  {R.decisions[p.slot.key] && R.decisions[p.slot.key].kind !== "ADDED" && <ActionButton url="/api/exam-board" body={{ action: "lead", team: team.key, exam: examType, op: "unpick", slot: p.slot.key }} label="Back to the ratings" className="btn btn-secondary btn-sm" />}
                  {q && <ActionForm url="/api/exam-board" fixed={{ action: "lead", team: team.key, exam: examType, op: "edit", itemId: q.id }} submit="Save" collapsed openLabel="Adjust wording / marks" initial={{ text: R.edits[q.id]?.text ?? q.text, marks: R.edits[q.id]?.marks ?? p.slot.marks ?? q.marks }} fields={[{ name: "text", label: "Question", type: "textarea" }, { name: "marks", label: "Marks", type: "number", width: 80 }]} />}
                  <ActionButton url="/api/exam-board" body={{ action: "lead", team: team.key, exam: examType, op: "remove", slot: p.slot.key }} label="Remove slot" className="btn btn-secondary btn-sm" confirmText="Remove this slot from the paper?" />
                </td>}
              </tr>
            );
          })}</tbody>
        </table>
        {!R.picks.length && <p className="small-note">No slots yet — drafts must be submitted first (or the Course Lead sets the team&apos;s question plan in Paper Distribution).</p>}
      </div>
      {lead && !R.published && <div className="card">
        <b>Course Lead</b>
        <ActionForm url="/api/exam-board" fixed={{ action: "lead", team: team.key, exam: examType, op: "add" }} submit="Add to the paper" collapsed openLabel="+ Add a question from the bank" fields={[{ name: "itemId", label: "Question", type: "select", options: R.bank.filter((q) => q.complete && !R.paper.some((x) => x.id === q.id)).map((q) => [q.id, `${q.cloCodes.join("/")} · ${dLabel(q.difficulty)} · ${q.text.slice(0, 80)}`] as [string, string]) }, { name: "note", label: "Why (optional)" }]} />
        <div style={{ marginTop: 8 }}><ActionButton url="/api/exam-board" body={{ action: "lead", team: team.key, exam: examType, op: "publish" }} label="Publish Official Exam Paper" className="btn btn-brass" confirmText="Publish and lock the official paper? Every section's question plan for this exam will be replaced by it." showMessage /></div>
      </div>}
      {!team.leadId && <div className="card"><p style={{ margin: 0 }}>A Course Lead must be named before the paper can be finalised.</p></div>}
    </>}

    {tab === "paper" && <OfficialPaper r={R} team={team} examType={examType} lead={lead} names={names} />}
  </>);
}

type Snap = { paper: (PaperQ & { kind: string; rubric: string | null; options: string[]; correctIndex: number | null; codeSnippet: string | null; hasImage: boolean; avg: number | null })[]; mapping: ReturnType<typeof mappingTable>; course: { code: string; title: string; term: string }; examType: string };
function OfficialPaper({ r, team, examType, lead, names }: { r: Round; team: Team; examType: string; lead: boolean; names: Map<string, string> }) {
  if (!r.published || !r.final?.paperJson) return <div className="card"><p style={{ margin: 0 }}>The official paper isn&apos;t published yet. The Course Lead publishes it from the consensus paper.</p></div>;
  const s = JSON.parse(r.final.paperJson) as Snap;
  const m = s.mapping;
  return (
    <div data-testid="official-paper">
      <div className="no-print" style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
        <PrintButton label="Print / Save as PDF" />
        {lead && <ActionButton url="/api/exam-board" body={{ action: "lead", team: team.key, exam: examType, op: "reopen" }} label="Reopen (unlock)" className="btn btn-secondary btn-sm" askNote="Why is the published paper reopened?" noteRequired />}
      </div>
      <div className="card">
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>{s.course.code} {s.course.title} — {examType} examination</h2>
        <p className="small-note" style={{ marginTop: 0 }}>{s.course.term} · Total marks: {m.total} · Published by {names.get(r.final.publishedById || "") || "the Course Lead"}{r.final.publishedAt ? ` on ${new Date(r.final.publishedAt).toISOString().slice(0, 10)}` : ""}</p>
        <ol style={{ fontSize: 14 }}>{s.paper.map((q) => (
          <li key={q.id} style={{ marginBottom: 12 }} data-paper-q={q.no}>
            <span style={{ whiteSpace: "pre-wrap" }}>{q.text}</span> <b>[{q.marks}]</b>
            {q.codeSnippet && <pre style={{ fontSize: 12, padding: 6, overflowX: "auto", border: "1px solid var(--line)" }}>{q.codeSnippet}</pre>}
            {q.options.length > 0 && <ol type="a">{q.options.map((o, i) => <li key={i}>{o}</li>)}</ol>}
            {q.hasImage && <div><img src={`/api/exam-board?image=${q.id}`} alt={`Diagram for question ${q.no}`} style={{ maxWidth: 420 }} /></div>}
          </li>
        ))}</ol>
      </div>
      <div className="card" style={{ overflowX: "auto" }} data-testid="clo-mapping">
        <b>Exam-to-CLO mapping table</b>
        <table className="table" style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}>
          <thead><tr><th>Q</th><th>CLO(s)</th><th>Topic</th><th>Bloom level</th><th>Difficulty</th><th>Marks</th><th>Peer rating</th></tr></thead>
          <tbody>{s.paper.map((q) => <tr key={q.id}><td>Q{q.no}</td><td>{q.cloCodes.join(", ")}</td><td>{q.lectureNumber !== null ? `L${q.lectureNumber} ` : ""}{q.topic}</td><td>{q.bloom} {BLOOM_NAMES[q.bloom] || ""}</td><td>{dLabel(q.difficulty)}</td><td>{q.marks}</td><td>{stars(q.avg)}</td></tr>)}</tbody>
        </table>
        <table className="table" style={{ fontSize: 12.5, marginTop: 10 }}>
          <thead><tr><th>CLO</th><th>Questions</th><th>Marks</th><th>% of paper</th></tr></thead>
          <tbody>{m.perClo.map((c) => <tr key={c.code} data-clo-row={c.code}><td>{c.code}</td><td>{c.questions.map((n) => `Q${n}`).join(", ")}</td><td>{c.marks}</td><td>{c.pct}%</td></tr>)}</tbody>
        </table>
        <p className="small-note">Difficulty: {m.difficulty.map((d) => `${dLabel(d.key)} ${d.pct}%`).join(" · ")} · Bloom: {m.bloom.map((d) => `${d.key} ${d.pct}%`).join(" · ")}. A question tagged to several CLOs shares its marks equally between them; each section&apos;s question plan records its first CLO.</p>
      </div>
    </div>
  );
}
