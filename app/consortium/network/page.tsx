import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { cdb, isActiveMember } from "../../../lib/consortium";
import * as N from "../../../lib/networkDegrees";
import { PlanEditor } from "../../../components/NetworkForms";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Network degrees" };

// Queue item 21: degree plans published ahead, shared teachers' rotations, the network question bank, the network's
// rules (complaints and appeals, leaving with notice, fee settlement) and the yearly quality review per offering.
const TABS = [["plans", "Degree plans"], ["teachers", "Shared teachers"], ["qbank", "Network question bank"], ["rules", "Complaints, notice & fees"], ["quality", "Quality review"]] as const;
const STAFF = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "SUBJECT_EXPERT", "INSTRUCTOR"];
const URL = "/api/consortium/network";
export default async function NetworkPage({ searchParams }: { searchParams: { tab?: string; program?: string; pair?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!STAFF.includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "plans";
  const planner = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"].includes(user.role);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Network degrees</h1>
    <p className="small-note" style={{ marginTop: 0 }}>A student plans a degree across member universities: home courses plus approved equivalents elsewhere, within the residency limits of the <Link href="/consortium">consortium rules</Link>. Seats are applied for under <Link href="/consortium/applications">Consortium students</Link>; results come home on the transcript; visiting faculty posts are under <Link href="/consortium/vacancies">Visiting faculty posts</Link>. <Link href="/network-scorecard">Public scorecard →</Link></p>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 10px" }}>{TABS.map(([k, t]) => <Link key={k} href={`/consortium/network?tab=${k}`} className={`btn btn-sm ${tab === k ? "" : "btn-secondary"}`}>{t}</Link>)}</div>
    {c}</Shell>;
  const member = await isActiveMember(cid).catch(() => null);
  if (member === null) return shell(<div className="card err">{N.NET_HINT}</div>);
  if (!member) return shell(<div className="card">Your university is not an active consortium member yet — apply on the <Link href="/consortium">Consortium</Link> page.</div>);
  if ((await N.recs("PLAN", { chairmanId: "none" })) === null) return shell(<div className="card err">{N.NET_HINT}</div>);

  if (tab === "plans") {
    const programs = await N.programsOf(cid);
    const program = searchParams.program && programs.includes(searchParams.program) ? searchParams.program : programs[0];
    if (!program) return shell(<p className="small-note">No programs yet.</p>);
    const p = await N.planOf(cid, program);
    const published = p.plans.filter((x) => x.status === "APPROVED");
    const latest = p.plans[0];
    const others = (await N.publishedPlans()).filter((x) => x.chairmanId !== cid);
    return shell(<>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>Program: {programs.map((g) => <Link key={g} href={`/consortium/network?tab=plans&program=${encodeURIComponent(g)}`} style={{ marginRight: 10, fontWeight: g === program ? 700 : 400 }}>{g}</Link>)}</div>
      <div className="card" style={{ borderLeft: `4px solid ${published.length >= 2 ? "#1B7F3B" : "#B26A00"}` }}><b>{program}</b> — {published.length} intake plan{published.length === 1 ? "" : "s"} published{published.length < 2 ? " · publish plans for at least the next two intakes so students elsewhere can plan" : ""}{published.length ? `: ${published.map((x) => x.intake).join(", ")}` : ""}.</div>
      <div className="card"><h3 style={{ marginTop: 0 }}>{latest ? `Plan for ${latest.intake} (${latest.status === "APPROVED" ? "published" : "draft"})` : "New plan"}</h3>
        {!p.courses.length ? <p className="small-note">No courses in this program&apos;s batches yet.</p> : planner
          ? <PlanEditor program={program} courses={p.courses} labels={latest?.d.labels || Object.fromEntries(p.courses.map((c) => [c.code, p.def(c)]))} intake={latest?.intake || ""} bos={latest?.d.bos || ""} canPublish={["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)} />
          : <p className="small-note">The Program Lead and Head of Department keep this plan.</p>}</div>
      {others.length > 0 && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Published by partner universities</h3>
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>University</th><th>Program</th><th>Intake</th><th>Network-open</th><th>Home or online</th><th>BOS</th></tr></thead>
          <tbody>{others.map((o, i) => <tr key={i}><td>{o.university}</td><td>{o.program}</td><td>{o.intake}</td><td>{Object.entries(o.labels).filter(([, v]) => v === "NETWORK").map(([k]) => k).join(", ") || "—"}</td><td>{Object.entries(o.labels).filter(([, v]) => v === "ONLINE").map(([k]) => k).join(", ") || "—"}</td><td>{o.bos}</td></tr>)}</tbody></table></div>}
    </>);
  }
  if (tab === "teachers") {
    const rows = await N.rotations();
    return shell(<>
      {planner && <div className="card"><h3 style={{ marginTop: 0 }}>Plan a shared teacher&apos;s rotation</h3>
        <ActionForm url={URL} fixed={{ action: "rotation" }} submit="Save rotation" fields={[{ name: "courseCode", label: "Course code" }, { name: "teacher", label: "Teacher", width: 180 }, { name: "start", label: "Starts", type: "date" }, { name: "legsText", label: "Universities and face-to-face weeks (University A 3 Lahore; University B 2 Karachi)", width: 420, full: true }, { name: "shared", label: "Shared calendar (both universities agreed)", type: "checkbox" }, { name: "note", label: "Note (online weeks, exams)", width: 300 }]} /></div>}
      <div className="card" style={{ overflowX: "auto" }}>{!rows.length ? <p className="small-note">No rotations yet.</p> :
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Teacher</th><th>Starts</th><th>Face-to-face weeks</th><th>Calendar</th><th>Note</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.courseCode}</td><td>{r.teacher}</td><td>{r.start || "—"}</td><td>{r.legs.map((l) => `${l.university} ${l.weeks}w${l.city ? ` (${l.city})` : ""}`).join(" → ")}</td><td>{r.shared ? "shared" : "each its own"}</td><td>{r.note}</td></tr>)}</tbody></table>}</div>
    </>);
  }
  if (tab === "qbank") {
    const shared = await N.sharedCourses(cid);
    const pair = shared.find((s) => s.pairId === searchParams.pair);
    const q = pair ? await N.blindQueue(cid, pair.pairId) : null;
    return shell(<>
      <div className="card" style={{ overflowX: "auto" }}><p className="small-note" style={{ marginTop: 0 }}>Every member adds questions to the bank of each shared course; a partner reviews them blind (no author or university shown). Last six months:</p>
        {!shared.length ? <p className="small-note">No approved equivalent courses with a partner yet (Agreements and course equivalence).</p> :
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Our course</th><th>Our questions</th><th>Partner</th><th>Their course</th><th>Their questions</th><th>Needed each</th><th></th></tr></thead>
            <tbody>{shared.map((s) => <tr key={s.pairId}><td>{s.mine.code} {s.mine.title}</td><td style={{ color: s.mine.n >= s.min ? "#1B7F3B" : "#B3261E" }}>{s.mine.n}</td><td>{s.otherName}</td><td>{s.other.code}</td><td>{s.other.n}</td><td>{s.min}</td><td><Link href={`/consortium/network?tab=qbank&pair=${s.pairId}`}>Review theirs blind →</Link></td></tr>)}</tbody></table>}</div>
      {q && <div className="card"><h3 style={{ marginTop: 0 }}>Blind review: {q.shared.other.code} ({q.reviewed} reviewed by your university)</h3>
        {!q.items.length ? <p className="small-note">Nothing waiting.</p> : q.items.map((i) => <div key={i.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>{i.text.slice(0, 400)} <span className="small-note">({i.marks} marks · {i.cloCode} · {i.bloom})</span>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}><ActionButton url={URL} body={{ action: "review", pairId: q.shared.pairId, itemId: i.id, ok: true }} label="Approve" /><ActionButton url={URL} body={{ action: "review", pairId: q.shared.pairId, itemId: i.id, ok: false }} label="Return" className="btn btn-secondary btn-sm" askNote="What should change?" noteRequired /></div></div>)}</div>}
    </>);
  }
  if (tab === "rules") {
    const [cs, st, members, notice] = await Promise.all([N.complaints(cid), N.settlement(cid), cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true } }).catch(() => []) as Promise<{ chairmanId: string }[]>, N.recs("LEAVING", { chairmanId: cid })]);
    const { prisma } = await import("../../../lib/db");
    const names = new Map<string, string>((await prisma.user.findMany({ where: { id: { in: members.map((m) => m.chairmanId).concat(cs.map((c) => c.against)) } }, select: { id: true, instituteName: true, name: true } })).map((u) => [u.id as string, String(u.instituteName || u.name)] as [string, string]));
    return shell(<>
      <div className="card"><h3 style={{ marginTop: 0 }}>Complaints and appeals</h3>
        <p className="small-note">The named university answers first; either side can appeal to the consortium panel (Super Admin team), then to HEC.</p>
        {planner && <ActionForm url={URL} fixed={{ action: "complaint" }} collapsed openLabel="File a complaint" submit="File" fields={[{ name: "against", label: "About university", type: "select", options: members.filter((m) => m.chairmanId !== cid).map((m) => [m.chairmanId, names.get(m.chairmanId) || m.chairmanId]) }, { name: "about", label: "Subject", width: 260 }, { name: "text", label: "What happened", type: "textarea", full: true }]} />}
        {cs.length > 0 && <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Filed</th><th>About</th><th>Against</th><th>Level</th><th>Status</th><th>History</th><th></th></tr></thead>
          <tbody>{cs.map((c) => <tr key={c.id}><td>{c.at.toISOString().slice(0, 10)}</td><td>{c.about}</td><td>{names.get(c.against) || "—"}</td><td>{c.level}</td><td>{c.status.toLowerCase()}</td><td>{c.history.map((h) => `${h.level}: ${h.decision}`).join(" · ") || c.text.slice(0, 120)}</td>
            <td>{planner && <><ActionButton url={URL} body={{ action: "decide", id: c.id, appeal: false }} label="Record decision" className="btn btn-secondary btn-sm" askNote="The decision" noteRequired /> {c.level !== "HEC" && <ActionButton url={URL} body={{ action: "decide", id: c.id, appeal: true }} label="Appeal" className="btn btn-secondary btn-sm" askNote="Why appeal?" noteRequired />}</>}</td></tr>)}</tbody></table>}</div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Fees between member universities</h3>
        {!st.length ? <p className="small-note">No accepted visiting students yet.</p> : <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Term</th><th>Home</th><th>Host</th><th>Students</th><th>Host&apos;s fees</th><th>Paid by students</th><th></th></tr></thead>
          <tbody>{st.map((x) => <tr key={x.key}><td>{x.term}</td><td>{x.homeName}</td><td>{x.hostName}</td><td>{x.students}</td><td>{x.due.toLocaleString()} {x.currency}</td><td>{x.paidByStudents.toLocaleString()}</td><td>{x.settled ? "✓ settled" : user.role === "CHAIRMAN" && <ActionButton url={URL} body={{ action: "settle", key: x.key }} label="Mark settled" className="btn btn-secondary btn-sm" askNote="Payment reference" noteRequired />}</td></tr>)}</tbody></table>}</div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Leaving the consortium</h3>
        {notice?.length ? <p style={{ fontSize: 13 }}>Notice given: leaves after <b>{JSON.parse(notice[0].json).until}</b>. Teach-out: {JSON.parse(notice[0].json).teachOut || "—"}</p>
          : user.role === "CHAIRMAN" ? <ActionForm url={URL} fixed={{ action: "notice" }} collapsed openLabel="Give notice" submit="Give notice" fields={[{ name: "months", label: "Months of notice", type: "number" }, { name: "teachOut", label: "Teach-out: how current visiting students finish", type: "textarea", full: true }]} /> : <p className="small-note">Only the Institute Head gives notice.</p>}</div>
    </>);
  }
  const rows = await N.quality(cid);
  return shell(<div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Yearly review of our offerings</h3>
    <p className="small-note">Students taught, results and pass rate come from the consortium records; add CLO attainment, moderation agreement with partners, feedback and actions once a year. A summary per university is public on the scorecard.</p>
    {!rows.length ? <p className="small-note">No offerings opened to the consortium yet.</p> : <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Term</th><th>Mode</th><th>Students</th><th>Results</th><th>Passed</th><th>Review</th><th></th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.course ? `${r.course.code} ${r.course.title}` : r.courseId}</td><td>{r.term}</td><td>{r.mode}</td><td>{r.students}</td><td>{r.results}</td><td>{r.results ? `${Math.round((100 * r.passed) / r.results)}%` : "—"}</td><td>{r.review ? `${r.review.year}: CLO ${r.review.cloPct ?? "—"}% · feedback ${r.review.feedback ?? "—"} · ${r.review.actions.slice(0, 80)}` : "—"}</td>
        <td>{planner && <ActionForm url={URL} fixed={{ action: "quality", offeringId: r.id }} collapsed openLabel={r.review ? "Update" : "Review"} submit="Save" initial={{ year: String(new Date().getUTCFullYear()), cloPct: r.review?.cloPct ?? "", feedback: r.review?.feedback ?? "", moderation: r.review?.moderation || "", actions: r.review?.actions || "" }} fields={[{ name: "year", label: "Year" }, { name: "cloPct", label: "Students reaching CLOs (%)", type: "number" }, { name: "feedback", label: "Feedback (of 5)", type: "number" }, { name: "moderation", label: "Moderation agreement with partners" }, { name: "actions", label: "Actions", type: "textarea", full: true }]} />}</td></tr>)}</tbody></table>}
  </div>);
}
