import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { EXAM_CONTROLLER } from "../../lib/academicRules";
import { TYPES, STAGES, GRADES, STUDENT_STATUS_LABEL, STATUS_HINT, policyFor, stageApprovers, dismissalSuggestions, feesDue, type Req, type Credit } from "../../lib/studentStatus";
import { titlesFor } from "../../lib/titles";
import { RaiseForm, DecideForm, CreditForm, CancelButton, PolicyForm } from "../../components/StatusChangeForms";
import HowCalculated from "../../components/HowCalculated";
import { StatusBadge } from "../../components/Meaning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student status changes" };
const sdb = prisma as unknown as Record<string, any>;
const day = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// Drop, leave, freeze, transfer within / out / in, rustication and readmission — one request, an approval chain and
// the effects applied on the effective date.
export default async function StatusChangesPage({ searchParams }: { searchParams: { id?: string; student?: string; type?: string; show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) redirect("/dashboard");
  const isController = (user.extraRoles || []).includes(EXAM_CONTROLLER);
  const leader = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role) || isController;
  // Students this person may raise for: their batches (Program Lead), the batches they advise, or all (Institute Head).
  const myBatches = await prisma.batch.findMany({ where: user.role === "CHAIRMAN" ? { coordinator: { managedById: user.id } } : { OR: [{ coordinatorId: user.id }, { advisorId: user.id }] }, select: { id: true, degreeProgram: true, batchName: true } });
  const allBatches = await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  if (!leader && !myBatches.length) redirect("/dashboard");
  const titles = await titlesFor(chairmanId);

  let missing = false;
  const all = ((await sdb.studentStatusRequest.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 400, select: { id: true, chairmanId: true, studentId: true, type: true, effectiveDate: true, reason: true, fromStatus: true, freezeSemesters: true, targetBatchId: true, otherInstitute: true, caseReference: true, docName: true, docType: true, creditsJson: true, suggested: true, feeOverride: true, status: true, stage: true, raisedById: true, raisedAs: true, appliedAt: true, effectsJson: true, decidedAt: true, createdAt: true } }).catch(() => { missing = true; return []; })) as Req[]);
  const myBatchIds = new Set(myBatches.map((b) => b.id));
  const stuIds = Array.from(new Set(all.map((r) => r.studentId)));
  const studs = await prisma.student.findMany({ where: { id: { in: stuIds.concat("none") } }, select: { id: true, name: true, rollNumber: true, status: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const sOf = new Map(studs.map((s) => [s.id, s]));
  // What this person may see, and what waits for them.
  const visible: Req[] = [], mine: Req[] = [];
  for (const r of all) {
    const pend = r.status === "PENDING" ? await stageApprovers(r, r.stage) : null;
    const waits = !!pend?.ids.includes(user.id);
    if (waits) mine.push(r);
    if (leader || waits || r.raisedById === user.id || myBatchIds.has(sOf.get(r.studentId)?.batchId || "") || (r.targetBatchId && myBatchIds.has(r.targetBatchId))) visible.push(r);
  }
  const show = searchParams.show || "open";
  const listed = visible.filter((r) => show === "all" || (show === "open" ? ["PENDING", "APPROVED"].includes(r.status) : r.status === show));
  const sel = searchParams.id ? visible.find((r) => r.id === searchParams.id) : null;
  const students = myBatches.length ? await prisma.student.findMany({ where: { batchId: { in: myBatches.map((b) => b.id) } }, select: { id: true, name: true, rollNumber: true, status: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { rollNumber: "asc" }, take: 3000 }) : [];
  const suggestions = !missing && (leader || myBatches.length) ? await dismissalSuggestions(chairmanId, leader && !myBatches.length ? undefined : user.role === "CHAIRMAN" || leader ? undefined : myBatches.map((b) => b.id)).catch(() => []) : [];
  const policy = await policyFor(chairmanId);
  const stageTitle = (s: string) => (s === "HOD" ? titles.HEAD_OF_DEPARTMENT.title : s === "CONTROLLER" ? titles.EXAM_CONTROLLER.title : s);
  const label = (r: Req) => { const s = sOf.get(r.studentId); return s ? `${s.name} (${s.rollNumber})` : "—"; };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: 22, marginBottom: 4 }}>Student status changes</h1>
          <p className="small-note" style={{ margin: 0 }}>Drop, leave, freeze, transfer, rustication and readmission — raised by the Program Lead or batch advisor, approved by the {titles.HEAD_OF_DEPARTMENT.title} and the {titles.EXAM_CONTROLLER.title}.</p></div>
        <Link href="/student-movement" className="btn btn-secondary btn-sm">Student movement report</Link>
      </div>
      <HowCalculated shows="How a status change is approved and what happens when it takes effect.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Approval chain:</b> the {titles.HEAD_OF_DEPARTMENT.title} of the student&apos;s department, then the {titles.EXAM_CONTROLLER.title}. A vacant or switched-off position passes to the next one up (Organisation Chart); a person acting in a position decides for it.</li>
          <li><b>On the effective date</b> (applied straight away if it has passed): current courses are dropped — or marked W on the transcript after week {policy.dropDeadlineWeek} of the semester; the teachers are told and the student leaves their class lists; the degree plan is locked; held registrations are cancelled; earned results and CLO/GA records are kept, and class averages count only students still enrolled.</li>
          <li>A student who leaves keeps <b>read-only</b> portal access (transcript, fees) for {policy.readOnlyDays} days. Left and dropped students get the exit survey; parents are informed; the Finance Officer is asked to work out any refund. A <b>freeze</b> holds the student back so they continue with the next batch on the same curriculum.</li>
          <li><b>Transfer in:</b> credits need grade {policy.transferMinGrade} or better and may be at most {policy.transferMaxPct}% of the program; they show as TR with no grade points. <b>Within the institute:</b> passed courses with the same code or title carry over with their grade; the rest are listed for the new Program Lead to accept or reject.</li>
        </ul>
      </HowCalculated>
      {missing && <div className="err">{STATUS_HINT}</div>}

      {sel && <Detail r={sel} user={user} stageTitle={stageTitle} label={label(sel)} student={sOf.get(sel.studentId)} batches={allBatches} />}

      {mine.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #B26A00" }}>
          <b>Waiting for you ({mine.length})</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{mine.map((r) => <li key={r.id}><Link href={`/status-changes?id=${r.id}`}>{label(r)} — {TYPES[r.type]?.label}</Link> <span className="small-note">effective {day(r.effectiveDate)}</span></li>)}</ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #C62828" }}>
          <b>Suggested by the academic rules: dismissal</b> <span className="small-note">— CGPA below the dismissal limit after the set number of probation semesters</span>
          <table style={{ fontSize: 13, marginTop: 6 }}><tbody>{suggestions.map((s) => <tr key={s.studentId}><td>{s.name} ({s.roll})</td><td className="small-note">{s.batch}</td><td>CGPA {s.cgpa} · {s.probations} probation semester(s)</td><td>{students.some((x) => x.id === s.studentId) && <Link href={`/status-changes?student=${s.studentId}&type=DROPPED`}>Raise</Link>}</td></tr>)}</tbody></table>
        </div>
      )}

      {students.length > 0 && <RaiseForm students={students.map((s) => ({ id: s.id, label: `${s.rollNumber} ${s.name} — ${s.batch.degreeProgram} ${s.batch.batchName}`, status: s.status }))} batches={allBatches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} types={Object.entries(TYPES).map(([k, t]) => [k, t.label, t.what])} initialStudent={searchParams.student} initialType={searchParams.type} />}

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {[["open", "Open"], ["APPLIED", "Applied"], ["REJECTED", "Not approved"], ["all", "All"]].map(([k, l]) => <Link key={k} href={`/status-changes?show=${k}`} className={`btn btn-sm ${show === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}
        </div>
        {listed.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No requests.</p> : (
          <table style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Change</th><th>Effective</th><th>Status</th><th>With</th></tr></thead>
            <tbody>{listed.map((r) => (
              <tr key={r.id}><td><Link href={`/status-changes?id=${r.id}&show=${show}`}>{label(r)}</Link><div className="small-note">{sOf.get(r.studentId)?.batch.degreeProgram} — {sOf.get(r.studentId)?.batch.batchName}</div></td>
                <td>{TYPES[r.type]?.label}{r.suggested && <span className="small-note"> (suggested by the rules)</span>}</td><td>{day(r.effectiveDate)}</td>
                <td><StatusBadge status={r.status === "APPLIED" ? "APPROVED" : r.status === "CANCELLED" ? "CLOSED" : r.status} label={r.status === "APPLIED" ? "Applied" : r.status === "APPROVED" ? "Approved — takes effect on the date" : r.status === "CANCELLED" ? "Withdrawn" : undefined} />{["APPROVED", "APPLIED"].includes(r.status) && <div><a href={`/status-changes/letter/${r.id}`} style={{ fontSize: 12 }}>Print signed letter</a></div>}</td>
                <td>{r.status === "PENDING" ? stageTitle(r.stage) : "—"}</td></tr>
            ))}</tbody></table>
        )}
      </div>
      {(user.role === "CHAIRMAN" || isController) && <PolicyForm p={policy} grades={GRADES} />}
    </Shell>
  );
}

async function Detail({ r, user, stageTitle, label, student, batches }: { r: Req; user: { id: string; role: string }; stageTitle: (s: string) => string; label: string; student?: { status: string; batchId: string } | undefined; batches: { id: string; degreeProgram: string; batchName: string }[] }) {
  const [apps, credits] = await Promise.all([
    sdb.studentStatusApproval.findMany({ where: { requestId: r.id }, orderBy: { at: "asc" } }) as Promise<{ stage: string; byId: string; decision: string; remarks: string | null; covering: string | null; at: Date }[]>,
    sdb.studentTransferCredit.findMany({ where: { requestId: r.id } }) as Promise<Credit[]>,
  ]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: apps.map((a) => a.byId).concat(r.raisedById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const pend = r.status === "PENDING" ? await stageApprovers(r, r.stage) : null;
  const pendNames = pend ? (await prisma.user.findMany({ where: { id: { in: pend.ids } }, select: { name: true } })).map((u) => u.name) : [];
  const canDecide = !!pend?.ids.includes(user.id);
  const due = canDecide && r.type === "LEFT" && r.stage === "CONTROLLER" ? await feesDue(r.studentId) : 0;
  const target = r.targetBatchId ? batches.find((b) => b.id === r.targetBatchId) : null;
  const creditBatch = r.type === "TRANSFER_INTERNAL" ? r.targetBatchId : student?.batchId;
  const canCredit = creditBatch ? !!(await prisma.batch.findFirst({ where: { id: creditBatch, OR: [{ coordinatorId: user.id }, { coordinator: { managedById: user.id } }] }, select: { id: true } })) : false;
  let effects: string[] = []; try { effects = JSON.parse(r.effectsJson); } catch { effects = []; }
  return (
    <div className="card" style={{ borderTop: "4px solid #7E2435" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div><h2 style={{ fontSize: 18, margin: 0 }}>{label} — {TYPES[r.type]?.label}</h2>
          <div className="small-note">Effective {day(r.effectiveDate)} · raised by {names.get(r.raisedById) || "—"} ({r.raisedAs.replace("_", " ").toLowerCase()}) on {day(r.createdAt)} · was {STUDENT_STATUS_LABEL[r.fromStatus || ""] || r.fromStatus}</div></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {r.docName && <a className="btn btn-secondary btn-sm" href={`/api/status-changes?doc=${r.id}`} target="_blank" rel="noreferrer">Document: {r.docName}</a>}
          {r.type === "TRANSFER_OUT" && <a className="btn btn-brass btn-sm" href={`/api/status-changes?pack=${r.id}`}>Transcript + course outlines (ZIP)</a>}
          {r.status === "PENDING" && r.raisedById === user.id && <CancelButton id={r.id} />}
        </div>
      </div>
      <p style={{ fontSize: 13.5, margin: "8px 0" }}><b>Reason:</b> {r.reason}</p>
      <div style={{ fontSize: 13 }}>
        {r.freezeSemesters && <div>Freeze for {r.freezeSemesters} semester(s)</div>}
        {target && <div>{r.type === "READMISSION" ? "Rejoins" : "Moves to"}: {target.degreeProgram} — {target.batchName}</div>}
        {r.otherInstitute && <div>{r.type === "TRANSFER_OUT" ? "To" : "From"}: {r.otherInstitute}</div>}
        {r.caseReference && <div>Case: {r.caseReference}</div>}
      </div>
      <h3 style={{ fontSize: 14.5, margin: "12px 0 4px" }}>Approvals</h3>
      <table style={{ fontSize: 13 }}><tbody>
        {apps.map((a, i) => <tr key={i}><td>{stageTitle(a.stage)}</td><td><b>{names.get(a.byId) || "—"}</b>{a.covering && <div className="small-note" style={{ color: "#8A4B00" }}>{a.covering}</div>}</td><td><StatusBadge status={a.decision} /></td><td>{day(a.at)}</td><td className="small-note">{a.remarks || ""}</td></tr>)}
        {pend && <tr><td>{stageTitle(r.stage)}</td><td colSpan={4}><StatusBadge status="PENDING" label="Waiting" /> {pendNames.join(", ")}{pend.note && <span className="small-note" style={{ color: "#8A4B00" }}> — {pend.note}</span>}</td></tr>}
      </tbody></table>
      {canDecide && <DecideForm id={r.id} leftWithFees={due} />}
      {credits.length > 0 && (
        <>
          <h3 style={{ fontSize: 14.5, margin: "12px 0 4px" }}>{r.type === "TRANSFER_IN" ? "Credit transfer" : "Courses carried over"}</h3>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>CH</th><th>Grade</th><th>Counts as</th><th>Decision</th></tr></thead>
            <tbody>{credits.map((c) => <tr key={c.id}><td>{c.fromCode} {c.fromTitle}</td><td>{c.creditHours}</td><td>{c.grade || "—"}</td><td>{c.toCode || "—"}</td>
              <td>{c.status === "PENDING" && canCredit ? <CreditForm creditId={c.id} toCode={c.toCode} /> : <StatusBadge status={c.status === "MATCHED" ? "APPROVED" : c.status === "ACCEPTED" ? "APPROVED" : c.status} label={c.status === "MATCHED" ? "Matched — carried over" : c.status === "ACCEPTED" ? "Accepted" : undefined} />}</td></tr>)}</tbody></table>
        </>
      )}
      {effects.length > 0 && (<><h3 style={{ fontSize: 14.5, margin: "12px 0 4px" }}>What was done ({day(r.appliedAt)})</h3><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{effects.map((e, i) => <li key={i}>{e}</li>)}</ul></>)}
      {STAGES.length === 0 && null}
    </div>
  );
}
