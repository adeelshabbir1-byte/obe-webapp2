import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { rowsOf, yearCardOf, yearLabelNow } from "../../../lib/yearPlan";
import { windowNow, myMentoring } from "../../../lib/allocExtras";
import { getFlag } from "../../../lib/scopedSettings";
import { Act, Concern, PrefForm, SwapAsk } from "../AllocForms";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// The teacher's side of allocation (Adeel prompt §25.2, 11, 13): his preferences (rank, sections, times), his approved
// year card (Fall, Spring, Summer) with the allocation letter, accept / raise a concern, and section swaps.
export default async function YearCardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const [prefs, details, card] = await Promise.all([
    prisma.facultyCoursePreference.findMany({ where: { facultyId: user.id }, orderBy: { priority: "asc" } }),
    (db.allocPrefDetail?.findMany({ where: { facultyId: user.id } }).catch(() => []) || []) as Promise<{ courseCode: string; sections: string | null; times: string | null }[]>,
    yearCardOf(user.id, cid),
  ]);
  const [win, mentoring] = await Promise.all([windowNow(cid), myMentoring(cid, yearLabelNow(), user.id).catch(() => ({ mentors: [], mentees: [] }))]);
  const swaps = ((await db.allocSwap?.findMany({ where: { bId: user.id, status: "ASKED" } }).catch(() => [])) || []) as { id: string; aId: string; aRow: string; bRow: string }[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: swaps.map((s) => s.aId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>My teaching — preferences and year card</h1>
      <div className="card" style={{ marginBottom: 10 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>My preferences</h3>
        {win.state !== "NONE" && <p style={{ fontSize: 13, padding: 6, borderRadius: 6, background: win.state === "OPEN" ? "#E3F2E6" : "#FBF3E4" }} data-window-state>{win.text}</p>}
        <p className="small-note">Rank the courses you want to teach. You may name sections (e.g. BSCS-1A, 1B) and times (e.g. mornings only; not Friday). Only one teacher asking for a course makes it uncontested.</p>
        {prefs.map((p) => { const d = details.find((x) => x.courseCode.toUpperCase() === p.courseCode.toUpperCase()); return <div key={p.id} style={{ marginBottom: 4 }}><PrefForm code={p.courseCode} rank={p.priority} sections={d?.sections} times={d?.times} /></div>; })}
        <div style={{ marginTop: 6 }}><PrefForm /></div>
      </div>
      {(mentoring.mentors.length > 0 || mentoring.mentees.length > 0) && <div className="card" style={{ marginBottom: 10, fontSize: 13 }} data-mentoring><b>Mentoring</b>{mentoring.mentors.map((x) => <div key={x.code}>Your mentor for <b>{x.code}</b> (first time): {x.mentor}</div>)}{mentoring.mentees.map((x) => <div key={x.code + x.teacher}>You mentor {x.teacher} for <b>{x.code}</b></div>)}</div>}
      {swaps.length > 0 && <div className="card" style={{ marginBottom: 10, fontSize: 13 }}><b>Swap requests</b>{swaps.map((s) => <div key={s.id}>{names.get(s.aId)} asks to swap {s.aRow.split("|").slice(0, 2).join(" ")} for your {s.bRow.split("|").slice(0, 2).join(" ")} <Act body={{ action: "swapAnswer", id: s.id, accept: true }} label="Agree" /> <Act body={{ action: "swapAnswer", id: s.id, accept: false }} label="Decline" /></div>)}</div>}
      {card.length === 0 ? <div className="card"><p>No approved year allocation for you yet.</p></div> : await Promise.all(card.map(async (c) => {
        const ack = await getFlag(user.id, `alloc:ack:${c.plan.id}`), concern = await getFlag(user.id, `alloc:concern:${c.plan.id}`);
        const others = rowsOf(c.plan).flatMap((r) => r.teachers.filter((t) => t.id !== user.id).map((t) => ({ key: r.key, label: `${r.term} ${r.code} ${r.batch}`, teacherId: t.id, teacher: t.name })));
        return (
          <div key={c.plan.id} className="card" style={{ marginBottom: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 15 }}>Year {c.plan.yearLabel}</h3>
            {Array.from(new Set(c.rows.map((r) => r.term))).map((t) => <div key={t} style={{ fontSize: 13, marginBottom: 6 }}><b>{t}</b>{c.rows.find((r) => r.term === t)?.summer ? " (tentative)" : ""}: {c.rows.filter((r) => r.term === t).map((r) => `${r.code} ${r.title} — ${r.batch} ×${r.mine}`).join(" · ")} <span className="small-note">({c.rows.filter((r) => r.term === t).reduce((a, r) => a + r.mine, 0)} sections)</span></div>)}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <a className="btn btn-sm" href="/api/allocation/letter">Allocation letter (PDF)</a>
              {ack ? <span className="small-note">Accepted ✓ {new Date(ack).toLocaleDateString("en-GB")}</span> : <Act body={{ action: "ack", planId: c.plan.id }} label="Accept" />}
              {concern ? <span className="small-note">Concern sent: {concern}</span> : <Concern planId={c.plan.id} />}
            </div>
            <div style={{ marginTop: 8 }}><SwapAsk planId={c.plan.id} mine={c.rows.map((r) => ({ key: r.key, label: `${r.term} ${r.code} ${r.batch}` }))} others={others} /></div>
          </div>
        );
      }))}
    </Shell>
  );
}
