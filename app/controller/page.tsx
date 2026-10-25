import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { controllerAccess, controllerChairman, controllerSummary, debarList, standingList, xdb, CONTROLLER_HINT } from "../../lib/examController";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controller of Examinations" };

const TABS = [["results", "Results"], ["recheck", "Re-checking"], ["debar", "Debarred lists & admit cards"], ["standing", "Standing lists"]] as const;
const d = (x: Date | string | null | undefined) => (x ? new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function ControllerPage({ searchParams }: { searchParams: { tab?: string; session?: string; batch?: string; prog?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await controllerAccess(user);
  if (!acc) redirect("/home");
  const cid = acc.chairmanId;
  const ctrlNow = acc.mode === "VIEW" ? await (await import("../../lib/academicRules")).examController(cid) : null;
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "results";
  const s = await controllerSummary(cid);
  const tile = (n: number | null, label: string, href: string, warn = false) => (
    <Link href={href} className="card" style={{ flex: "1 1 150px", margin: 0, textDecoration: "none", borderTop: `4px solid ${warn && n ? "#C62828" : "#1565C0"}` }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn && n ? "#C62828" : "#0D2A4A" }}>{n ?? "—"}</div><div className="small-note">{label}</div>
    </Link>
  );
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Controller of Examinations</h1>
      {acc.mode === "VIEW" && <div className="card" style={{ borderLeft: "5px solid #1565C0", padding: "8px 12px", fontSize: 13 }}><b>Oversight view.</b> {ctrlNow ? `${ctrlNow.name} is the Controller of Examinations` : "No Controller of Examinations is named yet — name one on the organisation chart (until then a Dean acts)"}; publishing, re-checking and debarring are done by them, not here.</div>}
      {acc.mode === "ACTING" && <div className="card" style={{ borderLeft: "5px solid #B26A00", padding: "8px 12px", fontSize: 13 }}><b>Acting Controller</b> — no Controller of Examinations is named yet, so you act as Controller. This goes away when the Institute Head names one.</div>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Exam sessions, date sheets, seating and invigilation are on <Link href="/exams">Exam Sessions</Link>. Here: publishing approved results, re-checking, debarred lists, admit cards and standing lists. Also: <Link href="/results-approval">grade changes</Link> · <Link href="/official-transcript">official transcripts</Link> · <Link href="/degrees">degrees</Link> · <Link href="/academic-rules">academic rules</Link>.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {tile(s.toPublish, "approved, ready to publish", "/controller?tab=results", true)}
        {tile(s.published, "results published", "/controller?tab=results")}
        {tile(s.awaitingApproval, "waiting for OMC / HOD approval", "/results-approval?show=SUBMITTED")}
        {tile(s.rechecks, "re-checking requests", "/controller?tab=recheck", true)}
        {tile(s.changes, "grade changes waiting", "/results-approval", true)}
        {tile(s.debarred, "students debarred (papers)", "/controller?tab=debar")}
      </div>
      <div className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8 }}>
        {TABS.map(([k, l]) => <Link key={k} href={`/controller?tab=${k}`} className={`btn btn-sm ${tab === k ? "" : "btn-secondary"}`}>{l}</Link>)}
      </div>
      {tab === "results" && <Results s={s} prog={searchParams.prog} />}
      {tab === "recheck" && <Rechecks cid={cid} />}
      {tab === "debar" && <Debar cid={cid} sessions={s.sessions} sel={searchParams.session} batch={searchParams.batch} />}
      {tab === "standing" && <Standing cid={cid} batch={searchParams.batch} />}
    </Shell>
  );
}

function Results({ s, prog }: { s: Awaited<ReturnType<typeof controllerSummary>>; prog?: string }) {
  const progs = Array.from(new Set(s.board.map((c) => c.batch?.degreeProgram || "—"))).sort();
  const list = s.board.filter((c) => !prog || (c.batch?.degreeProgram || "—") === prog);
  const ready = list.filter((c) => c.status === "APPROVED" && !c.published);
  const STATUS: Record<string, [string, string]> = { DRAFT: ["Not submitted", "#777"], RETURNED: ["Returned", "#C62828"], SUBMITTED: ["Waiting for approval", "#B26A00"], APPROVED: ["Approved", "#2E7D32"] };
  return (
    <>
      <div className="card">
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="tab" value="results" />
          <select name="prog" defaultValue={prog || ""}><option value="">All programs</option>{progs.map((p) => <option key={p}>{p}</option>)}</select>
          <button className="btn btn-sm btn-secondary">Filter</button>
        </form>
        <p className="small-note">A result can be published only after it is approved (OMC / Head of Department). Students then see the grade as final and may ask for re-checking within the window you set.</p>
        {ready.length > 0
          ? <ActionForm url="/api/controller" fixed={{ action: "publish", courseIds: ready.map((c) => c.id).join(",") }} fields={[{ name: "recheckDays", label: "Re-checking window (days, 0 = none)", type: "number", width: 120 }]} initial={{ recheckDays: 7 }} submit={`Publish ${ready.length} approved result(s)${prog ? ` of ${prog}` : ""}`} />
          : <p className="small-note">Nothing approved is waiting to be published.</p>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Program</th><th>Teacher</th><th>Students</th><th>Result</th><th>Published</th><th></th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id}><td><b>{c.code}</b> {c.title}</td><td>{c.batch?.degreeProgram} {c.batch?.batchName}</td><td>{c.instructor?.name || "—"}</td><td>{c._count.studentEnrollments}</td>
              <td style={{ color: STATUS[c.status]?.[1], fontWeight: 700 }}>{STATUS[c.status]?.[0] || c.status}</td>
              <td>{c.published ? <>{d(c.published.publishedAt)}{c.published.recheckUntil ? <div className="small-note">re-check until {d(c.published.recheckUntil)}</div> : null}</> : "—"}</td>
              <td>{c.published ? <ActionButton url="/api/controller" body={{ action: "unpublish", courseId: c.id }} label="Withdraw" className="btn btn-secondary btn-sm" confirmText="Withdraw this publication? Students will see the result as not final again." />
                : c.status === "APPROVED" ? <ActionButton url="/api/controller" body={{ action: "publish", courseIds: c.id, recheckDays: 7 }} label="Publish" /> : null}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

async function Rechecks({ cid }: { cid: string }) {
  const rows = (await xdb.resultRecheck.findMany({ where: { chairmanId: cid }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => null)) as { id: string; courseId: string; studentId: string; reason: string; status: string; note: string | null; createdAt: Date }[] | null;
  if (!rows) return <div className="card small-note">{CONTROLLER_HINT}</div>;
  const [cs, ss] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat("none") } }, select: { id: true, code: true, instructor: { select: { name: true } } } }),
    prisma.student.findMany({ where: { id: { in: rows.map((r) => r.studentId).concat("none") } }, select: { id: true, name: true, rollNumber: true } }),
  ]);
  const C = new Map(cs.map((c) => [c.id, c])), S = new Map(ss.map((x) => [x.id, x]));
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>Students ask from their portal while the re-checking window is open. If the grade must change, the teacher raises a grade change (approved here or by the HOD) and you mark the request <b>Changed</b>.</p>
      {rows.length === 0 ? <p className="small-note">No requests.</p> : (
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Asked</th><th>Student</th><th>Course</th><th>Reason</th><th>Status</th><th>Decide</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{d(r.createdAt)}</td><td>{S.get(r.studentId)?.rollNumber} {S.get(r.studentId)?.name}</td><td>{C.get(r.courseId)?.code}<div className="small-note">{C.get(r.courseId)?.instructor?.name}</div></td>
              <td style={{ maxWidth: 280 }}>{r.reason}</td><td><b>{r.status}</b>{r.note ? <div className="small-note">{r.note}</div> : null}</td>
              <td>{r.status === "PENDING" ? <ActionForm url="/api/controller" fixed={{ action: "recheck", id: r.id }} fields={[{ name: "status", label: "Decision", type: "select", options: [["UPHELD", "Result stands"], ["CHANGED", "Grade changed"], ["REJECTED", "Not accepted"]] }, { name: "note", label: "Note" }]} initial={{ status: "UPHELD" }} submit="Save" collapsed openLabel="Decide" /> : null}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

async function Debar({ cid, sessions, sel, batch }: { cid: string; sessions: { id: string; name: string; status: string }[]; sel?: string; batch?: string }) {
  const s = sessions.find((x) => x.id === sel) || sessions[0];
  if (!s) return <div className="card small-note">No exam session yet — create one on <Link href="/exams">Exam Sessions</Link>.</div>;
  const list = await debarList(cid, s.id).catch(() => null);
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  return (
    <>
      <div className="card">
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input type="hidden" name="tab" value="debar" />
          <select name="session" defaultValue={s.id}>{sessions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn btn-sm btn-secondary">Show</button></form>
        <h3>Admit cards</h3>
        <form action="/admit-card" target="_blank" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="session" value={s.id} />
          <select name="batch" defaultValue={batch}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
          <button className="btn btn-sm">Print admit cards</button>
        </form>
        <p className="small-note">Each card lists the student&apos;s papers with date, time and room; debarred papers are struck out. Students can also print their own from My Exams.</p>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Debarred list — short attendance</h3>
        {!list ? <p className="small-note">{CONTROLLER_HINT}</p> : (
          <>
            <p className="small-note">Below {list.min}% attendance (the minimum set in Academic Rules) in this session&apos;s courses: {list.rows.length} paper(s). Issued: {list.savedCount}, condoned: {list.condoned}.</p>
            {list.rows.some((r) => !r.saved) && <ActionButton url="/api/controller" body={{ action: "debar-save", sessionId: s.id }} label="Issue the debarred list" confirmText="Issue the list? Each student and their teachers are told." />}
            <table style={{ fontSize: 12.5, marginTop: 8 }}><thead><tr><th>Student</th><th>Course</th><th>Attendance</th><th>Status</th><th></th></tr></thead>
              <tbody>{list.rows.map((r) => (
                <tr key={r.courseId + r.studentId}><td>{r.rollNumber} {r.name}</td><td>{r.code}</td><td style={{ color: "#C62828", fontWeight: 700 }}>{r.pct.toFixed(0)}%</td>
                  <td>{r.saved ? <b style={{ color: r.saved.status === "CONDONED" ? "#2E7D32" : "#C62828" }}>{r.saved.status}</b> : <span className="small-note">not issued</span>}{r.saved?.note ? <div className="small-note">{r.saved.note}</div> : null}</td>
                  <td>{r.saved && (r.saved.status === "DEBARRED"
                    ? <ActionButton url="/api/controller" body={{ action: "debar-status", sessionId: s.id, id: r.saved.id, status: "CONDONED" }} label="Condone" className="btn btn-secondary btn-sm" askNote="Reason (e.g. medical certificate)" noteRequired />
                    : <ActionButton url="/api/controller" body={{ action: "debar-status", sessionId: s.id, id: r.saved.id, status: "DEBARRED" }} label="Debar again" className="btn btn-secondary btn-sm" />)}</td></tr>
              ))}</tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

async function Standing({ cid, batch }: { cid: string; batch?: string }) {
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === batch) || batches[0];
  const rows = sel ? await standingList(cid, sel.id) : [];
  const C: Record<string, string> = { GOOD_STANDING: "#2E7D32", WARNING: "#B26A00", PROBATION: "#C62828" };
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input type="hidden" name="tab" value="standing" />
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <button className="btn btn-sm btn-secondary">Show</button>
        {sel && <a className="btn btn-sm btn-secondary" href={`/api/controller?standing=${sel.id}`}>Download (Excel)</a>}</form>
      <p className="small-note">Merit order by CGPA (best attempt per course). Ties share a position. Standing uses the CGPA limits in Academic Rules.</p>
      <table style={{ fontSize: 12.5 }}><thead><tr><th>#</th><th>Roll number</th><th>Name</th><th>CGPA</th><th>Standing</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} style={{ background: r.position && r.position <= 3 ? "#FFF3C4" : undefined }}><td><b>{r.position ?? "—"}</b></td><td>{r.rollNumber}</td><td>{r.name}</td><td><b>{r.cgpa?.toFixed(2) ?? "—"}</b></td><td style={{ color: C[r.standing], fontWeight: 700 }}>{r.standing.replace("_", " ").toLowerCase()}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
