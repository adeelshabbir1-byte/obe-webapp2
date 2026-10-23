import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, staffOf } from "../../lib/registers";
import { appBaseFrom, requestOrigin } from "../../lib/signoff";
import { rdb2, REC_HINT, DESIGNATIONS, DEGREES, HEC_RULES, DEFAULT_WEIGHTS, STAGES, stageApprovers, merit, hiringRecord, type Request as HiringReq, type Pub } from "../../lib/recruitment";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS: [string, string][] = [["requests", "Requests to hire"], ["applications", "Applications"], ["board", "Selection board"], ["record", "Hiring record"]];
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS_LABEL: Record<string, string> = { APPLIED: "Applied", SHORTLISTED: "Shortlisted", NOT_SHORTLISTED: "Not shortlisted", SELECTED: "Selected", NOT_SELECTED: "Not selected", OFFERED: "Offer sent", JOINED: "Joined", DECLINED: "Declined" };

// Recruitment: requests to hire and their approval, advertisements with the online form, applications checked against
// the HEC criteria and scored, the selection board, offer letters, joining, and the hiring record (NBEAC Appendix 4C).
export default async function RecruitmentPage({ searchParams }: { searchParams: { tab?: string; ad?: string; area?: string; positions?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  let missing = false, requests: HiringReq[] = [], ads: { id: string; requestId: string; title: string; token: string; status: string; closeAt: Date; openFrom: Date }[] = [], boardsMine: string[] = [];
  try {
    requests = await rdb2.hiringRequest.findMany({ where: { chairmanId: w.chairmanId, ...(w.head || w.dean || w.finance ? {} : w.hod ? { departmentId: user.departmentId || "none" } : { id: "none" }) }, orderBy: { createdAt: "desc" }, take: 100 });
    ads = await rdb2.jobAdvert.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { openFrom: "desc" } });
    boardsMine = ((await rdb2.selectionBoard.findMany({ where: { advertId: { in: ads.map((a) => a.id).concat(["none"]) } } })) as { advertId: string; membersJson: string }[]).filter((b) => (JSON.parse(b.membersJson) as string[]).includes(user.id)).map((b) => b.advertId);
  } catch { missing = true; }
  const visibleAds = ads.filter((a) => requests.some((r) => r.id === a.requestId) || boardsMine.includes(a.id));
  if (!missing && !(w.head || w.dean || w.hod || w.finance || boardsMine.length)) redirect("/dashboard");
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "requests";
  const ad = visibleAds.find((a) => a.id === searchParams.ad) || visibleAds[0] || null;
  const m = ad && (tab === "applications" || tab === "board") ? await merit(ad.id) : null;
  const staff = await staffOf(w.chairmanId);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const depts = new Map((await prisma.department.findMany({ where: { id: { in: requests.map((r) => r.departmentId || "none") } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const approvals = (await rdb2.hiringApproval.findMany({ where: { requestId: { in: requests.map((r) => r.id).concat(["none"]) } }, orderBy: { at: "asc" } }).catch(() => [])) as { requestId: string; stage: string; byId: string; decision: string; note: string | null; at: Date }[];
  const waitingFor = new Map<string, string[]>(); for (const r of requests.filter((x) => x.status === "PENDING")) waitingFor.set(r.id, await stageApprovers(r, r.stage));
  const o = requestOrigin(); const base = appBaseFrom(o.host, o.proto);
  const rec = tab === "record" && !missing ? await hiringRecord(w.chairmanId) : [];
  const desigOpts = Object.entries(DESIGNATIONS) as [string, string][];
  const adPicker = (t: string) => visibleAds.length > 1 && <form method="get" className="no-print" style={{ display: "flex", gap: 6, marginBottom: 8 }}><input type="hidden" name="tab" value={t} /><select name="ad" className="input" defaultValue={ad?.id}>{visibleAds.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>;
  const isMember = !!ad && !!m?.members.includes(user.id);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Recruitment</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>A Head of Department asks to hire; the request goes to the Dean, the Institute Head and Finance (budget). Approved requests are advertised with an online form; applications are checked against the HEC criteria and scored; the selection board recommends and the Institute Head approves.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{REC_HINT}</p></div>}
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{TABS.map(([k, l]) => <Link key={k} href={`/recruitment?tab=${k}${ad ? `&ad=${ad.id}` : ""}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}</div>

      {tab === "requests" && !missing && (
        <>
          {(w.hod || w.dean || w.head) && (
            <div className="card">
              <ActionForm url="/api/recruitment" fixed={{ action: "raise" }} collapsed={!searchParams.area} openLabel="Ask to hire…" submit="Send for approval" initial={{ designation: "LECTURER", area: searchParams.area || "", positions: Number(searchParams.positions) || 1 }}
                fields={[{ name: "designation", label: "Designation", type: "select", options: desigOpts }, { name: "area", label: "Area of specialisation", type: "text" }, { name: "positions", label: "How many", type: "number" }, { name: "justification", label: "Justification (courses without a teacher, student numbers, accreditation ratio …)", type: "textarea" }]} />
              <p className="small-note" style={{ marginBottom: 0 }}>Tip: the hiring gaps on the course assigner&apos;s automatic allocation link here with the area filled in.</p>
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            {requests.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No requests yet.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Position</th><th>Asked by</th><th>Approvals</th><th>Status</th><th></th></tr></thead>
                <tbody>{requests.map((r) => { const advert = ads.find((a) => a.requestId === r.id); return (
                  <tr key={r.id}>
                    <td><b>{r.positions} × {DESIGNATIONS[r.designation]}</b> — {r.area}<div className="small-note" style={{ margin: 0 }}>{depts.get(r.departmentId || "") || ""}</div><div style={{ fontSize: 12 }}>{r.justification}</div></td>
                    <td>{nameOf.get(r.raisedById) || "—"}<div className="small-note" style={{ margin: 0 }}>{day(r.createdAt)}</div></td>
                    <td style={{ fontSize: 12 }}>{STAGES.map((s) => { const a = approvals.find((x) => x.requestId === r.id && x.stage === s.stage); return <div key={s.stage}>{s.label}: {a ? <span style={{ color: a.decision === "REJECTED" ? "#B3261E" : "#1E6B3A" }}>{a.decision === "PASSED" ? "passed (no one else)" : `${a.decision.toLowerCase()} by ${nameOf.get(a.byId) || "—"}`}{a.note && a.decision !== "PASSED" ? ` — ${a.note}` : ""}</span> : r.status === "PENDING" && r.stage === s.stage ? <b style={{ color: "#B45309" }}>waiting ({(waitingFor.get(r.id) || []).map((id) => nameOf.get(id)).filter(Boolean).join(", ")})</b> : "—"}</div>; })}</td>
                    <td style={{ fontWeight: 700, color: r.status === "APPROVED" ? "#1E6B3A" : r.status === "REJECTED" ? "#B3261E" : "#B45309" }}>{r.status.toLowerCase()}{advert ? <div className="small-note" style={{ margin: 0 }}>advertised · {advert.status.toLowerCase()}</div> : null}</td>
                    <td>
                      {r.status === "PENDING" && (waitingFor.get(r.id) || []).includes(user.id) && <div style={{ display: "flex", gap: 4 }}><ActionButton url="/api/recruitment" body={{ action: "decide", id: r.id, approve: true }} label={r.stage === "FINANCE" ? "Budget confirmed" : "Approve"} askNote={r.stage === "FINANCE" ? "Budget head / note (optional)" : undefined} /><ActionButton url="/api/recruitment" body={{ action: "decide", id: r.id, approve: false }} label="Return" className="btn btn-secondary btn-sm" askNote="Why?" noteRequired /></div>}
                      {r.status === "APPROVED" && !advert && (w.head || w.dean || r.raisedById === user.id) && <ActionForm url="/api/recruitment" fixed={{ action: "advertise", requestId: r.id }} collapsed openLabel="Advertise…" submit="Publish the advertisement" initial={DEFAULT_WEIGHTS}
                        fields={[{ name: "closeAt", label: "Last date to apply", type: "date" }, { name: "qualification", label: "Weight: qualification (%)", type: "number" }, { name: "experience", label: "Weight: experience (%)", type: "number" }, { name: "publications", label: "Weight: publications (%)", type: "number" }, { name: "interview", label: "Weight: interview (%)", type: "number" }, { name: "text", label: "Advertisement text (leave empty to write it from the request and the HEC criteria)", type: "textarea" }]} />}
                      {advert && <a href={`/jobs/${advert.token}`} target="_blank" rel="noreferrer" className="small-note">public form</a>}
                    </td>
                  </tr>
                ); })}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "applications" && !missing && (!ad ? <div className="card"><p className="small-note" style={{ margin: 0 }}>Nothing advertised yet.</p></div> : m && (
        <>
          {adPicker("applications")}
          <div className="card">
            <b>{ad.title}</b> · {ad.status === "OPEN" && new Date(ad.closeAt) >= new Date() ? `open until ${day(ad.closeAt)}` : "closed"} · {m.rows.length} application(s)
            <div className="small-note" style={{ margin: "4px 0", wordBreak: "break-all" }}>Application form: <a href={`/jobs/${ad.token}`} target="_blank" rel="noreferrer">{base}/jobs/{ad.token}</a></div>
            <div className="small-note" style={{ margin: 0 }}>HEC criteria: {m.req ? HEC_RULES[m.req.designation].text : ""} · Weights: qualification {m.weights.qualification}%, experience {m.weights.experience}%, publications {m.weights.publications}%, interview {m.weights.interview}%</div>
            {ad.status === "OPEN" && <div style={{ marginTop: 6 }}><ActionButton url="/api/recruitment" body={{ action: "closeAdvert", id: ad.id }} label="Close applications" className="btn btn-secondary btn-sm" confirmText="Close the application form?" /></div>}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            {m.rows.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No applications yet.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Candidate</th><th>Qualification &amp; experience</th><th>Publications</th><th>HEC check</th><th>Score</th><th>Status</th><th></th></tr></thead>
                <tbody>{m.rows.map(({ a, total, ok }) => { const pubs = JSON.parse(a.publicationsJson) as Pub[]; const checks = JSON.parse(a.eligibilityJson) as { label: string; ok: boolean; value: string }[]; return (
                  <tr key={a.id}>
                    <td><b>{a.name}</b><div className="small-note" style={{ margin: 0 }}>{a.email}{a.phone ? ` · ${a.phone}` : ""}</div>{a.cvName && <a href={`/api/recruitment?cv=${a.id}`} className="small-note">CV</a>}</td>
                    <td>{a.degreeTitle || DEGREES[a.highestDegree]}{a.university ? `, ${a.university}` : ""}{a.degreeYear ? ` (${a.degreeYear})` : ""}<div className="small-note" style={{ margin: 0 }}>{a.teachingYears} yrs teaching ({a.postPhdYears} after PhD) · {a.industryYears} yrs industry</div></td>
                    <td>{pubs.length} ({["W", "X", "Y"].map((c) => `${c} ${pubs.filter((p) => p.category === c).length}`).join(", ")})</td>
                    <td style={{ fontSize: 12 }}>{checks.map((c, i) => <div key={i} style={{ color: c.ok ? "#1E6B3A" : "#B3261E" }}>{c.ok ? "✓" : "✗"} {c.label} ({c.value})</div>)}{a.override && <div style={{ color: "#7A4B00" }}>Accepted by the committee: {a.overrideReason}</div>}</td>
                    <td><b>{total}</b><div className="small-note" style={{ margin: 0 }}>of {100 - m.weights.interview} before interview</div></td>
                    <td style={{ fontWeight: 700 }}>{STATUS_LABEL[a.status]}</td>
                    <td style={{ display: "grid", gap: 4 }}>
                      {!a.eligible && !a.override && <ActionButton url="/api/recruitment" body={{ action: "override", applicationId: a.id, on: true }} label="Accept anyway…" className="btn btn-secondary btn-sm" askNote="Why does the committee accept this candidate?" noteRequired />}
                      {ok && ["APPLIED", "NOT_SHORTLISTED"].includes(a.status) && <ActionButton url="/api/recruitment" body={{ action: "shortlist", applicationId: a.id, on: true }} label="Shortlist" />}
                      {a.status === "SHORTLISTED" && <ActionButton url="/api/recruitment" body={{ action: "shortlist", applicationId: a.id, on: false }} label="Remove from shortlist" className="btn btn-secondary btn-sm" />}
                    </td>
                  </tr>
                ); })}</tbody>
              </table>
            )}
            <HowCalculated shows="How the check and the score work.">
              <p style={{ margin: 0 }}>The check compares the qualification, years of experience and papers in HEC-recognised journals (categories W, X, Y) with the HEC criteria for the designation as we know them — check the current HEC notification. The score adds: qualification (PhD full marks, MS two-thirds, 16 years one-third), experience (15 years = full; industry counts half), publications (W 6, X 4, Y 2, other 1 point; 30 points = full), and the board&apos;s average interview mark, each times its weight.</p>
            </HowCalculated>
          </div>
        </>
      ))}

      {tab === "board" && !missing && (!ad ? <div className="card"><p className="small-note" style={{ margin: 0 }}>Nothing advertised yet.</p></div> : m && (
        <>
          {adPicker("board")}
          <div className="card">
            <b>{ad.title}</b>
            {m.board ? <div className="small-note" style={{ margin: "4px 0" }}>Board: {m.members.map((id) => nameOf.get(id)).join(", ")}{m.board.interviewAt ? ` · interviews ${new Date(m.board.interviewAt).toLocaleString("en-GB")}` : ""}{m.board.venue ? `, ${m.board.venue}` : ""}</div> : <p className="small-note">No selection board yet.</p>}
            {(w.head || w.dean || m.req?.raisedById === user.id) && !m.board?.approvedAt && <ActionForm url="/api/recruitment" fixed={{ action: "board", advertId: ad.id }} collapsed openLabel={m.board ? "Change the board…" : "Set up the selection board…"} submit="Save" initial={Object.fromEntries(m.members.map((id, i) => [`m${i + 1}`, id]))}
              fields={[...[1, 2, 3, 4, 5].map((i) => ({ name: `m${i}`, label: `Member ${i}${i <= 2 ? "" : " (optional)"}`, type: "select" as const, options: [["", "—"] as [string, string], ...staff.map((s) => [s.id, s.name] as [string, string])] })), { name: "interviewAt", label: "Interviews on", type: "datetime-local" as const }, { name: "venue", label: "Venue", type: "text" as const }]} />}
          </div>
          {m.board && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ marginTop: 0 }}>Merit list</h3>
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>#</th><th>Candidate</th><th>Before interview</th><th>Interview (average)</th><th>Total</th><th>Status</th>{isMember && !m.board.approvedAt && <th>My marks</th>}<th></th></tr></thead>
                <tbody>{m.rows.filter((r) => ["SHORTLISTED", "SELECTED", "NOT_SELECTED", "OFFERED", "JOINED", "DECLINED"].includes(r.a.status)).map((r, i) => { const mine = r.marks.find((x) => x.memberId === user.id); const pre = Math.round((r.total - r.parts.interview * m.weights.interview) * 10) / 10; return (
                  <tr key={r.a.id}>
                    <td>{i + 1}</td><td><b>{r.a.name}</b></td><td>{pre}</td>
                    <td>{r.interview ?? "—"}<div className="small-note" style={{ margin: 0 }}>{r.marks.length} of {m.members.length} members</div></td>
                    <td><b>{r.total}</b></td><td style={{ fontWeight: 700 }}>{STATUS_LABEL[r.a.status]}</td>
                    {isMember && !m.board!.approvedAt && <td><ActionForm url="/api/recruitment" fixed={{ action: "mark", applicationId: r.a.id }} collapsed openLabel={mine ? `${mine.marks} — change` : "Give marks"} submit="Save" initial={{ marks: mine?.marks ?? "", remarks: mine?.remarks || "" }} fields={[{ name: "marks", label: "Marks (out of 100)", type: "number" }, { name: "remarks", label: "Remarks", type: "text" }]} /></td>}
                    <td style={{ display: "grid", gap: 4 }}>
                      {["SELECTED", "OFFERED", "JOINED"].includes(r.a.status) && <a className="btn btn-secondary btn-sm" href={`/api/recruitment?offer=${r.a.id}`}>Offer letter (Word)</a>}
                      {["SELECTED", "OFFERED"].includes(r.a.status) && (w.head || w.dean || w.hod) && <ActionForm url="/api/recruitment" fixed={{ action: "join", applicationId: r.a.id }} collapsed openLabel="Record joining…" submit="Create the account" fields={[{ name: "username", label: "Username", type: "text" }, { name: "password", label: "First password (they change it at first sign-in)", type: "text" }]} />}
                      {["SELECTED", "OFFERED"].includes(r.a.status) && <ActionButton url="/api/recruitment" body={{ action: "declined", applicationId: r.a.id }} label="Declined the offer" className="btn btn-secondary btn-sm" confirmText="Record that the candidate declined?" />}
                    </td>
                  </tr>
                ); })}</tbody>
              </table>
              {!m.board.recommendedAt && !m.board.approvedAt && (isMember || m.req?.raisedById === user.id) && <ActionButton url="/api/recruitment" body={{ action: "recommend", advertId: ad.id }} label={`Recommend the top ${m.req?.positions || 1} for appointment`} confirmText="Send the recommendation (top of the merit list) to the Institute Head?" />}
              {m.board.recommendedAt && !m.board.approvedAt && <p style={{ margin: "8px 0 0", fontWeight: 700, color: "#B45309" }}>Recommended on {day(m.board.recommendedAt)} — waiting for the Institute Head. {w.head && <span style={{ display: "inline-flex", gap: 6 }}><ActionButton url="/api/recruitment" body={{ action: "approveBoard", advertId: ad.id, approve: true }} label="Approve the appointment" /><ActionButton url="/api/recruitment" body={{ action: "approveBoard", advertId: ad.id, approve: false }} label="Return" className="btn btn-secondary btn-sm" askNote="Why?" noteRequired /></span>}</p>}
              {m.board.approvedAt && <p style={{ margin: "8px 0 0", fontWeight: 700, color: "#1E6B3A" }}>Approved by {nameOf.get(m.board.approvedById || "") || "the Institute Head"} on {day(m.board.approvedAt)}.</p>}
            </div>
          )}
        </>
      ))}

      {tab === "record" && !missing && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>Faculty hiring record (NBEAC Appendix 4C)</h3><a className="btn btn-brass btn-sm" href="/api/recruitment?record=1">Excel</a></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Position</th><th>Posts</th><th>Advertised</th><th>Applicants</th><th>Eligible</th><th>Shortlisted</th><th>Selected</th><th>Joined</th><th>Days to hire</th></tr></thead>
            <tbody>{rec.map((r, i) => <tr key={i}><td>{r.title}</td><td>{r.positions}</td><td>{day(r.advertised)}</td><td>{r.applicants}</td><td>{r.eligible}</td><td>{r.shortlisted}</td><td>{r.selected}</td><td>{r.joined}</td><td>{r.daysToHire ?? "—"}</td></tr>)}</tbody>
          </table>
          {!rec.length && <p className="small-note">No advertisements yet.</p>}
        </div>
      )}
    </Shell>
  );
}
