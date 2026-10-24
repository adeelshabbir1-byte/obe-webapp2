import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT } from "../../../lib/consortium";
import { labOf } from "../../../lib/consortiumOfferings";
import { eligibility, type Vacancy, type VApp } from "../../../lib/consortiumVacancies";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teaching posts" };

const ST: Record<string, [string, string]> = { APPLIED: ["Applied", "#B26A00"], SHORTLISTED: ["Shortlisted", "#1565C0"], OFFERED: ["Offered to you", "#6A1B9A"], ACCEPTED: ["You teach it", "#2E7D32"], DECLINED: ["You declined", "#6B7177"], REJECTED: ["Not selected", "#6B7177"], WITHDRAWN: ["Withdrawn", "#6B7177"] };

// Faculty: teaching posts at other member universities — apply, follow, accept an offer.
// Chairman: also the NOC requests of your own faculty.
export default async function Teaching() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const e = await eligibility(user.id).catch(() => null);
  if (!e) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const mine = (await cdb.consortiumVacancyApplication.findMany({ where: { applicantId: user.id }, orderBy: { createdAt: "desc" } })) as VApp[];
  const noc = user.role === "CHAIRMAN" ? ((await cdb.consortiumVacancyApplication.findMany({ where: { homeChairmanId: user.id, nocStatus: "PENDING" } })) as VApp[]) : [];
  const actives = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true } })) as { chairmanId: string }[]).map((x) => x.chairmanId);
  const open = e.ok ? ((await cdb.consortiumVacancy.findMany({ where: { status: "OPEN", chairmanId: { in: actives.filter((x) => x !== e.home) } }, orderBy: { createdAt: "desc" }, take: 200 })) as Vacancy[]).filter((v) => !v.deadline || v.deadline >= new Date(new Date().toDateString())) : [];
  const vids = Array.from(new Set([...open.map((v) => v.id), ...mine.map((a) => a.vacancyId), ...noc.map((a) => a.vacancyId)]));
  const vacs = (await cdb.consortiumVacancy.findMany({ where: { id: { in: vids } } })) as Vacancy[];
  const courses = await prisma.course.findMany({ where: { id: { in: vacs.map((v) => v.courseId) } }, select: { id: true, code: true, title: true, creditHours: true, hasLab: true, labPct: true, batch: { select: { degreeProgram: true } }, clos: { where: { source: "SE" }, select: { statement: true }, take: 6 } } });
  const heads = await prisma.user.findMany({ where: { id: { in: vacs.map((v) => v.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const people = await prisma.user.findMany({ where: { id: { in: noc.map((a) => a.applicantId) } }, select: { id: true, name: true } });
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  const V = (id: string) => vacs.find((v) => v.id === id), C = (v?: Vacancy) => courses.find((c) => c.id === v?.courseId);
  const applied = new Set(mine.map((a) => a.vacancyId));
  const line = (v: Vacancy) => { const c = C(v); return <><b>{c?.code} {c?.title}</b> <span className="small-note">{uni(v.chairmanId)} · {v.term} · {v.mode === "ONLINE" ? "online" : "on campus"} · {c?.creditHours}{c && labOf(c) ? ` (${c.creditHours - labOf(c)}+${labOf(c)})` : ""} CH{v.schedule ? ` · ${v.schedule}` : ""}{v.pay && v.showPay ? ` · PKR ${v.pay.toLocaleString()} ${v.payBasis || ""}` : ""}{v.deadline ? ` · apply by ${v.deadline.toISOString().slice(0, 10)}` : ""}</span></>; };
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Teaching Posts at other universities</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Member universities post courses they need a visiting teacher for. The host sees your qualifications and how often you taught the course on OBEHUB; your CLO attainment and student feedback only if you tick them. If your university asks for a NOC to teach elsewhere, your Chairman decides first.</p>
    {!e.ok && <div className="card" style={{ borderLeft: "4px solid #B26A00" }}>{e.why}</div>}

    {noc.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>NOC requests from your faculty</h3>
      <table style={{ fontSize: 13 }}><tbody>{noc.map((a) => { const v = V(a.vacancyId)!; return (
        <tr key={a.id}><td><b>{people.find((p) => p.id === a.applicantId)?.name}</b> wants to teach</td><td>{line(v)}</td>
          <td style={{ whiteSpace: "nowrap" }}><ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "noc", id: a.id, ok: true }} label="Give NOC" />{" "}<ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "noc", id: a.id, ok: false }} label="Refuse" className="btn btn-secondary btn-sm" askNote="Why? (the teacher sees this)" noteRequired /></td></tr>); })}</tbody></table></div>}

    {mine.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>My applications</h3>
      <table style={{ fontSize: 13 }}><tbody>{mine.map((a) => { const v = V(a.vacancyId); const [l, col] = ST[a.status] || [a.status, "#555"]; return v ? (
        <tr key={a.id}><td>{line(v)}{a.hostNote ? <div className="small-note">{a.hostNote}</div> : null}{a.nocStatus !== "NOT_REQUIRED" ? <div className="small-note">Your university&apos;s NOC: {a.nocStatus.toLowerCase()}{a.nocNote ? ` — ${a.nocNote}` : ""}</div> : null}</td>
          <td style={{ color: col, fontWeight: 700 }}>{l}</td>
          <td style={{ whiteSpace: "nowrap" }}>{a.status === "OFFERED" && <><ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "answer", id: a.id, accept: true }} label="Accept" confirmText="Accept and become the teacher of this course?" />{" "}<ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "answer", id: a.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" /></>}
            {a.status === "ACCEPTED" && <Link href="/dashboard" className="small-note">Open my courses →</Link>}</td></tr>) : null; })}</tbody></table></div>}

    {e.ok && <div className="card"><h3 style={{ marginTop: 0 }}>Open posts</h3>
      {!open.filter((v) => !applied.has(v.id)).length ? <p className="small-note">No open posts right now.</p> : <div style={{ display: "grid", gap: 10 }}>{open.filter((v) => !applied.has(v.id)).map((v) => { const c = C(v); return (
        <div key={v.id} style={{ border: "1px solid var(--line, #E1E5EA)", borderRadius: 10, padding: "10px 12px" }}>
          <div>{line(v)}</div>
          {c?.batch?.degreeProgram && <div className="small-note">Part of {c.batch.degreeProgram}</div>}
          {v.requirements && <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 4 }}>{v.requirements}</div>}
          {c?.clos.length ? <details style={{ marginTop: 4 }}><summary className="small-note">Course learning outcomes</summary><ol style={{ fontSize: 12.5, margin: "4px 0", paddingLeft: 18 }}>{c.clos.map((x, i) => <li key={i}>{x.statement}</li>)}</ol></details> : null}
          <ActionForm showMessage url="/api/consortium/vacancies" fixed={{ action: "apply", vacancyId: v.id }} submit="Apply" collapsed openLabel="Apply…" initial={{ shareAttainment: true, shareFeedback: true }}
            fields={[{ name: "coverNote", label: "Why you (experience with this course, availability)", type: "textarea" }, { name: "shareAttainment", label: "Show my sections' CLO attainment for this course", type: "checkbox" }, { name: "shareFeedback", label: "Show my student feedback for this course", type: "checkbox" }]} />
        </div>); })}</div>}
    </div>}
  </>);
}
