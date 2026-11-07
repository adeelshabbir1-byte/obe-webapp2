import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { examChairman } from "../../lib/examBranch";
import * as G from "../../lib/paperGen";
import { Act, ErrorNote, PolicyPick, SpecForm } from "../../components/PaperGenControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paper generation" };

// Queue item 18: papers generated at run time by the Controller from each course's question bank, under settings the
// Subject Expert proposes, the Program Lead checks and the OMC approves (then locked).
const STATUS: Record<string, string> = { DRAFT: "not proposed", PROPOSED: "waiting for the Program Lead", PL_OK: "waiting for the OMC", LOCKED: "✓ locked" };
export default async function PaperGeneration() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const controller = (await examChairman(user as never)) === cid;
  const settings = await G.settingsOf(cid);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Paper generation</h1>{c}</Shell>;
  if (!settings) return shell(<div className="card">{G.PG_HINT}</div>);
  const omc = user.role === "OMC" || !!(await prisma.user.findUnique({ where: { id: user.id }, select: { omcHat: true } }))?.omcHat;
  const mine = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: cid }, ...(controller || omc || ["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role) ? {} : { OR: [{ subjectExpertId: user.id }, { instructorId: user.id }, { coordinatorId: user.id }] }) }, select: { code: true, title: true, subjectExpertId: true, instructorId: true, coordinatorId: true, clos: { where: { source: "SE" }, select: { code: true }, orderBy: { orderIndex: "asc" } } }, orderBy: { code: "asc" } });
  const codes = new Map<string, (typeof mine)[number]>(); for (const c of mine) if (!codes.has(c.code)) codes.set(c.code, c);
  const gens = await G.generatedOf(cid);
  const policy = { Midterm: await G.policyOf(cid, "Midterm"), Final: await G.policyOf(cid, "Final") };
  const reviewable = [];
  for (const g of gens.filter((x) => x.status === "GENERATED")) if (await G.mayReview(user as never, cid, g)) reviewable.push({ g, items: await G.paperItems(cid, g) });
  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
  return shell(<>
    <p className="small-note" style={{ marginTop: 0 }}>Every teacher of a course adds questions to its bank; only reviewed questions are used. The course&apos;s Subject Expert (or the instructor where there is none) proposes the paper settings, the Program Lead checks them against the bank, the OMC approves, and they lock. The Controller then generates the paper — with backup versions — at the exam time and prints it with a check code partner universities can verify.</p>
    {controller && <div className="card"><b>Who sees a paper before the exam</b><PolicyPick examType="Midterm" value={policy.Midterm} options={G.POLICIES} /><PolicyPick examType="Final" value={policy.Final} options={G.POLICIES} /></div>}
    {reviewable.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Papers for you to review</h3>{reviewable.map(({ g, items }) => <div key={g.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}><b>{g.courseCode} {g.examType} · version {g.version}</b>
      <ol style={{ margin: "4px 0 4px 18px" }}>{items.map((q, i) => <li key={q.id}>{q.text.slice(0, 160)} <span className="small-note">({q.marks} · {q.cloCodes.join(",")} · {q.bloom})</span> <Act body={{ action: "review", genId: g.id, swap: i }} label="Swap" /></li>)}</ol>
      <Act body={{ action: "review", genId: g.id }} label="Approve for printing" /></div>)}</div>}
    {Array.from(codes.values()).map((c) => <div key={c.code} className="card"><b>{c.code} — {c.title}</b>
      {(["Midterm", "Final"] as const).map((t) => { const s = settings.find((x) => x.courseCode === c.code && x.examType === t); const st = s?.status || "DRAFT"; const spec = s ? JSON.parse(s.specJson) : null; const can = (user.id === c.subjectExpertId || (!c.subjectExpertId && user.id === c.instructorId)) && st !== "LOCKED";
        const gs = s ? gens.filter((g) => g.settingId === s.id) : [];
        return <div key={t} style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}>
          <div style={{ fontSize: 13 }}><b>{t}</b> · {STATUS[st]}{s?.plAt ? ` · PL ${d(s.plAt)}` : ""}{s?.omcAt ? ` · OMC ${d(s.omcAt)}` : ""}{" "}
            {st === "PROPOSED" && user.id === c.coordinatorId && <Act body={{ action: "pl", code: c.code, examType: t }} label="Checked — send to the OMC" />}
            {st === "PL_OK" && omc && <Act body={{ action: "omc", code: c.code, examType: t }} label="Approve and lock" />}
            {(st === "PROPOSED" || st === "PL_OK" || st === "LOCKED") && (user.id === c.coordinatorId || omc) && <Act body={{ action: "return", code: c.code, examType: t }} label="Reopen" confirm="Reopen the settings? They will need approval again." />}
            {st === "LOCKED" && controller && <Act body={{ action: "generate", settingId: s!.id }} label="Generate now" confirm="Generate the paper and its backup versions now?" />}</div>
          {st !== "LOCKED" && <SpecForm code={c.code} examType={t} clos={c.clos.map((x) => x.code)} spec={spec} can={can} />}
          {st === "LOCKED" && spec && <div className="small-note">{spec.total} marks · {spec.minutes} min · {spec.versions || 2} versions · CLO shares {Object.entries(spec.cloShares).map(([k, v]) => `${k} ${v}`).join(", ")}</div>}
          {controller && gs.length > 0 && <table className="table" style={{ fontSize: 12, marginTop: 4 }}><tbody>{gs.map((g) => <tr key={g.id}><td>v{g.version}</td><td>{d(g.at)}</td><td>{g.status.toLowerCase()}</td><td>{g.checkCode}</td><td>{g.status !== "GENERATED" ? <a href={`/api/paper-generation?print=${g.id}`}>Print (PDF)</a> : "waiting for review"}</td><td><ErrorNote genId={g.id} note={g.errorNote} /></td></tr>)}</tbody></table>}
        </div>; })}</div>)}
    {!codes.size && <p className="small-note">No offered course of yours this term.</p>}
  </>);
}
