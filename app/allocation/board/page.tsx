import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import Tabs from "../../../components/Tabs";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { board, fairness } from "../../../lib/allocBoard";
import { Act } from "../AllocForms";
import RuleForm from "./RuleForm";

export const dynamic = "force-dynamic";

// Preferences board (Adeel prompt §25.2–6, 14): click a course → only the teachers interested in it; click a teacher →
// only his courses; a subject area → its teachers and courses together. Uncontested / contested / nobody; points;
// HOD rules; fairness report.
type SP = { tab?: string; course?: string; teacher?: string; area?: string; all?: string };
export default async function AllocationBoardPage({ searchParams: sp }: { searchParams: SP }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"].includes(user.role)) redirect("/allocation/year-card");
  const cid = await chairmanIdFor(user as never);
  const b = await board(user as never, cid);
  const tab = sp.tab || "courses";
  const hod = ["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role);
  const lines = b.lines.filter((l) => (!sp.area || l.category === sp.area) && (!sp.course || l.code === sp.course));
  const teachers = b.teachers.filter((t) => (!sp.area || t.category === sp.area) && (!sp.teacher || t.id === sp.teacher));
  const badge = { UNCONTESTED: ["#E3F2E6", "#1B6B3A", "uncontested"], CONTESTED: ["#FBF3E4", "#7A520C", "contested"], NOBODY: ["#FBE9E7", "#B3261E", "nobody asked"] } as const;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Allocation — preferences board</h1>
      <p className="small-note">Teachers rank courses and may pick sections and times on their <Link href="/allocation/year-card">year card</Link>. A course only one teacher asked for is <b>uncontested</b> (he gets it unless it overloads him or breaks a rule); two or more is <b>contested</b> — teachers are ranked by points (their rank, times taught, subject match, load). <Link href="/allocation/year-plan">Year plan →</Link></p>
      <form className="card no-print" style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap" }}><input type="hidden" name="tab" value={tab} />
        <select name="area" defaultValue={sp.area || ""}><option value="">All subject areas</option>{b.categories.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn btn-sm">Show</button> <Link href="/allocation/board" className="small-note">Clear</Link></form>
      <Tabs base={`/allocation/board?area=${encodeURIComponent(sp.area || "")}`} current={tab} tabs={[{ key: "courses", label: "By course" }, { key: "teachers", label: "By teacher" }, ...(hod ? [{ key: "rules", label: "HOD rules" }] : []), { key: "fairness", label: "Fairness" }]} />
      {tab === "courses" && lines.map((l) => (
        <div key={l.code} className="card" style={{ marginBottom: 8 }}>
          <div><Link href={`/allocation/board?tab=courses&course=${encodeURIComponent(l.code)}`}><b>{l.code}</b> {l.title}</Link> <span className="small-note">{l.category || ""}{l.specialisation ? " · specialisation" : ""} · {l.sections} section(s)</span> <span style={{ background: badge[l.state][0], color: badge[l.state][1], borderRadius: 8, padding: "0 7px", fontSize: 11.5 }}>{badge[l.state][2]}</span></div>
          {l.ruleNotes.map((n, i) => <div key={i} className="small-note">⚑ {n}</div>)}
          {l.interested.length ? <table className="table" style={{ fontSize: 12, marginTop: 4 }}><tbody>{l.interested.map((t) => <tr key={t.id} style={{ opacity: t.rule ? 0.55 : 1 }}><td><Link href={`/allocation/board?tab=teachers&teacher=${t.id}`}>{t.name}</Link>{t.rule ? ` — ${t.rule}` : ""}</td><td>rank {t.rank}</td><td>{t.sections || "any section"}</td><td>{t.times || ""}</td><td>taught {t.taught}×</td><td style={{ color: t.load >= t.cap ? "#B3261E" : undefined }}>load {t.load}/{t.cap}</td><td><b>{t.points}</b> pts</td></tr>)}</tbody></table> : <p className="small-note">Nobody asked for it — suggest a teacher of the same subject area under his load, ask through a faculty request, or mark it Visiting needed.</p>}
        </div>
      ))}
      {tab === "teachers" && <div className="card"><table className="table" style={{ fontSize: 12.5, width: "100%" }}><tbody>{teachers.map((t) => <tr key={t.id}><td><b>{t.name}</b> <span className="small-note">{t.category || ""}</span></td><td style={{ color: t.load > t.cap ? "#B3261E" : undefined }}>load {t.load}/{t.cap}</td><td>{t.courses.length ? t.courses.map((c) => <Link key={c} href={`/allocation/board?tab=courses&course=${encodeURIComponent(c)}`} style={{ marginRight: 6 }}>{c}</Link>) : <span className="small-note">no preferences yet</span>}</td></tr>)}</tbody></table></div>}
      {tab === "rules" && hod && <div className="card" style={{ fontSize: 13 }}>
        <p className="small-note">Applied before suggestions: must-teach, must-not, and at most N brand-new courses per teacher per term (now {b.maxNew}).</p>
        <ul>{b.rules.map((r) => <li key={r.id}>{r.kind === "MAX_NEW" ? `At most ${r.n} new course(s) per term` : `${r.kind === "MUST" ? "Must teach" : "Must not teach"} ${r.courseCode}: ${b.teachers.find((t) => t.id === r.facultyId)?.name || "?"}`}{r.reason ? ` — ${r.reason}` : ""} <Act body={{ action: "unrule", id: r.id }} label="Remove" /></li>)}</ul>
        <RuleForm teachers={b.teachers.map((t) => ({ id: t.id, name: t.name }))} />
      </div>}
      {tab === "fairness" && <div className="card"><table className="table" style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Teacher</th><th>Sections</th><th>Per term</th><th>Different courses</th><th>Repeats</th><th>Large classes</th></tr></thead><tbody>{(await fairness(cid)).map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.sections}</td><td>{f.perTerm}</td><td>{f.courses}</td><td>{f.repeats}</td><td>{f.large}</td></tr>)}</tbody></table><p className="small-note">Who keeps getting large classes, how often each teacher repeats the same course, and sections per term.</p></div>}
    </Shell>
  );
}
