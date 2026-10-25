import Link from "next/link";
import { prisma } from "../lib/db";
import { threeWay } from "../lib/threeWay";
import { reviewState, KINDS } from "../lib/batchReview";
import { offeredTracks } from "../lib/batchSetup";
import { LIST_TYPES } from "../lib/autoCopyPreviousBatch";
import { ActionButton, ActionForm } from "./fyp/FypClient";
import PrintButton from "./PrintButton";

// The batch approval, shared by the Program Lead's last set-up step and the OMC's review. The OMC walks it step by
// step (?s=1…8); the Program Lead sees the comparison, the checklist and "Send to the OMC", then the OMC's proposals
// (giving his opinion on each) and, once finalised, the final version with the summary of changes.

export const REVIEW_STEPS = ["Comparison", "Structure", "Changes", "Semesters & prerequisites", "Electives & tracks", "Subject Experts", "Course → GA", "Endorse & finalise"];

export async function ThreeWayTable({ batchId }: { batchId: string }) {
  const t = await threeWay(batchId);
  if (!t) return null;
  const col = (x: { code: string; title: string; ch: number; sem: number | null } | null) => x ? <><td>{x.code}</td><td>{x.title}</td><td>{x.ch}</td><td>{x.sem ?? "—"}</td></> : <><td colSpan={4} style={{ color: "#999" }}>—</td></>;
  const colour = (s: string) => s === "Same" ? undefined : s.startsWith("Dropped") || s.startsWith("Council course") ? "#FDECEA" : s.startsWith("Changed") ? "#FFF6E0" : "#E8F1FB";
  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <a className="btn btn-secondary btn-sm" href={`/api/batch-review/excel?batchId=${batchId}`}>Excel</a>
        <PrintButton label="PDF" className="btn btn-secondary btn-sm" />
        <span className="small-note" style={{ margin: 0 }}>{Object.entries(t.counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12, width: "100%" }}>
          <thead>
            <tr><th colSpan={4}>This batch — {t.batch.batchName}</th><th colSpan={4}>{t.ref ? `${t.ref.authority} ${t.ref.title}${t.ref.version ? ` (${t.ref.version})` : ""}` : "No council curriculum"}</th><th colSpan={4}>{t.prevBatch ? `Previous batch — ${t.prevBatch.batchName}` : "No previous batch"}</th><th rowSpan={2}>Status</th></tr>
            <tr>{[0, 1, 2].map((i) => <><th key={`a${i}`}>Code</th><th key={`b${i}`}>Title</th><th key={`c${i}`}>CH</th><th key={`d${i}`}>Sem</th></>)}</tr>
          </thead>
          <tbody>{t.rows.map((r) => <tr key={r.key} style={{ background: colour(r.status) }}>{col(r.batch)}{col(r.council)}{col(r.prev)}<td>{r.status}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}><b>Total</b></td><td><b>{t.totals.batch}</b></td><td /><td colSpan={2} /><td><b>{t.totals.council}</b></td><td /><td colSpan={2} /><td><b>{t.totals.prev}</b></td><td /><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

async function data(batchId: string) {
  const courses = await prisma.course.findMany({ where: { batchId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, courseType: true, isNonCredit: true, subjectExpert: { select: { id: true, name: true } }, prerequisiteCourse: { select: { code: true } }, ploMappings: { select: { ploId: true } } } });
  const plos = await prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } });
  const changes = ((await (prisma as unknown as Record<string, any>).batchSchemeChange.findMany({ where: { batchId }, orderBy: { at: "asc" } }).catch(() => [])) as { id: string; code: string; title: string; action: string; why: string | null; byName: string; at: Date }[]);
  return { courses, plos, changes, tracks: await offeredTracks(batchId) };
}

export default async function BatchReviewView({ batchId, viewer, s, base }: { batchId: string; viewer: { id: string; role: string }; s: number; base: string }) {
  const st = await reviewState(batchId);
  const { courses, plos, changes, tracks } = await data(batchId);
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true } });
  const lead = viewer.id === b?.coordinatorId;
  const member = st.com.all.includes(viewer.id) || viewer.role === "OMC";
  const convener = st.com.convenerId === viewer.id;
  const open = !!st.review && st.review.status !== "APPROVED";
  const core = courses.filter((c) => !LIST_TYPES.includes(c.courseType));
  const pick = core.map((c) => [c.id, `${c.code} ${c.title}`] as [string, string]);
  const propose = (kind: string, extra: { name: string; label: string; type?: "text" | "number" | "select"; options?: [string, string][] }[] = []) => member && open ? (
    <ActionForm url="/api/batch-review" fixed={{ action: "propose", batchId, kind }} collapsed openLabel={`Propose: ${KINDS[kind]}`} submit="Propose"
      fields={[{ name: "courseId", label: "Course", type: "select", options: pick }, ...extra, { name: "reason", label: "Reason", type: "textarea", full: true }]} />
  ) : null;
  const ses = member && open ? await prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: st.chairmanId }, { managedBy: { managedById: st.chairmanId } }], role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"] } }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 400 }) : [];

  const steps: React.ReactNode[] = [
    <ThreeWayTable key="c" batchId={batchId} />,
    <table key="s" style={{ fontSize: 12.5 }}><thead><tr><th>Semester</th><th>Courses</th><th>Credit hours</th></tr></thead><tbody>{Array.from(new Set(core.map((c) => c.semesterNumber))).map((sem) => { const cs = core.filter((c) => c.semesterNumber === sem); return <tr key={String(sem)}><td>{sem ?? "Not placed"}</td><td>{cs.map((c) => c.code).join(", ")}</td><td>{cs.filter((c) => !c.isNonCredit).reduce((n, c) => n + c.creditHours, 0)}</td></tr>; })}</tbody><tfoot><tr><td><b>Total</b></td><td>{core.length} courses</td><td><b>{core.filter((c) => !c.isNonCredit).reduce((n, c) => n + c.creditHours, 0)}</b></td></tr></tfoot></table>,
    changes.length ? <ul key="ch" style={{ fontSize: 12.5 }}>{changes.map((x) => <li key={x.id}><b>{x.code} {x.title}</b> — {x.action.toLowerCase().replace(/_/g, " ")}{x.why ? `: ${x.why}` : ""} <span className="small-note">({x.byName}, {new Date(x.at).toLocaleDateString("en-GB")})</span></li>)}</ul> : <p key="ch" className="small-note">No changes made during set-up.</p>,
    <div key="p"><table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Semester</th><th>Prerequisite</th></tr></thead><tbody>{core.map((c) => <tr key={c.id}><td>{c.code} {c.title}</td><td>{c.semesterNumber ?? "—"}</td><td>{c.prerequisiteCourse?.code || "—"}</td></tr>)}</tbody></table>{propose("SEMESTER", [{ name: "semester", label: "To semester", type: "number" }])}</div>,
    <div key="e"><p style={{ fontSize: 13 }}><b>Tracks:</b> {tracks.length ? tracks.map((t) => t.name).join(", ") : "none"}</p>{LIST_TYPES.map((t) => { const xs = courses.filter((c) => c.courseType === t); return xs.length ? <p key={t} style={{ fontSize: 12.5 }}><b>{t} options ({xs.length}):</b> {xs.map((c) => `${c.code} ${c.title}`).join(" · ")}</p> : null; })}{propose("NAME", [{ name: "code", label: "New code" }, { name: "title", label: "New title" }])}</div>,
    <div key="se"><table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Subject Expert</th></tr></thead><tbody>{core.map((c) => <tr key={c.id}><td>{c.code} {c.title}</td><td>{c.subjectExpert?.name || <span style={{ color: "#B3261E" }}>none</span>}</td></tr>)}</tbody></table>{propose("SE", [{ name: "userId", label: "Subject Expert", type: "select", options: ses.map((u) => [u.id, u.name] as [string, string]) }])}</div>,
    <div key="ga">{plos.length ? <div style={{ overflowX: "auto" }}><table style={{ fontSize: 12 }}><thead><tr><th>Course</th>{plos.map((p) => <th key={p.id} title={p.title}>GA{p.number}</th>)}</tr></thead><tbody>{core.map((c) => <tr key={c.id}><td>{c.code} {c.title}</td>{plos.map((p) => <td key={p.id} style={{ textAlign: "center" }}>{c.ploMappings.some((m) => m.ploId === p.id) ? "✓" : ""}</td>)}</tr>)}</tbody></table></div> : <p className="small-note">This batch has no GAs yet.</p>}
      <p className="small-note">The OMC decides which course maps to which GA; the Subject Expert later maps each CLO to a GA.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{propose("GA_ADD", [{ name: "ploId", label: "GA", type: "select", options: plos.map((p) => [p.id, `GA${p.number} ${p.title}`] as [string, string]) }])}{propose("GA_REMOVE", [{ name: "ploId", label: "GA", type: "select", options: plos.map((p) => [p.id, `GA${p.number} ${p.title}`] as [string, string]) }])}</div></div>,
    <div key="f">
      <p style={{ fontSize: 13 }}><b>Endorsed {st.yes} of {st.total}</b>{st.waiting.length ? ` · waiting: ${st.waiting.join(", ")}` : ""}{st.endorse.filter((e) => !e.endorse).length ? ` · not endorsed: ${st.endorse.filter((e) => !e.endorse).map((e) => e.userName).join(", ")}` : ""}</p>
      {open && st.com.all.includes(viewer.id) && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionButton url="/api/batch-review" body={{ action: "endorse", batchId, endorse: true }} label="Endorse" className="btn btn-sm" />
        <ActionButton url="/api/batch-review" body={{ action: "endorse", batchId, endorse: false }} label="Do not endorse" askNote="Why?" noteRequired className="btn btn-secondary btn-sm" />
      </div>}
      {open && convener && <p><ActionButton url="/api/batch-review" body={{ action: "finalise", batchId }} label={st.canFinalise ? "Finalise — approve the batch with the proposals kept" : `Finalise (needs a majority: ${st.yes} of ${st.total})`} className="btn" confirmText="Finalise? The kept proposals are applied and the Program Lead, HOD and Dean are told." /></p>}
      {open && !st.com.convenerId && <p className="small-note" style={{ color: "#B3261E" }}>No OMC Convener is set for this department — set one on the organisation chart.</p>}
    </div>,
  ];

  const proposals = st.proposals.length ? (
    <div className="card"><h3 style={{ marginTop: 0 }}>OMC proposals ({st.proposals.filter((p) => p.status !== "WITHDRAWN").length})</h3>
      <table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Proposal</th><th>Reason</th><th>By</th><th>Program Lead</th><th>Status</th><th /></tr></thead>
        <tbody>{st.proposals.map((p) => <tr key={p.id} style={{ opacity: p.status === "WITHDRAWN" ? 0.5 : 1 }}><td>{p.text}</td><td>{p.reason}</td><td>{p.byName}</td>
          <td>{p.plOpinion ? `${p.plOpinion === "AGREE" ? "Agrees" : "Disagrees"}${p.plComment ? ` — ${p.plComment}` : ""}` : lead && open ? <span style={{ display: "flex", gap: 4 }}><ActionButton url="/api/batch-review" body={{ action: "opinion", batchId, proposalId: p.id, agree: "yes" }} label="Agree" askNote="Comment (optional)" className="btn btn-sm" /><ActionButton url="/api/batch-review" body={{ action: "opinion", batchId, proposalId: p.id, agree: "no" }} label="Disagree" askNote="Your reason" noteRequired className="btn btn-secondary btn-sm" /></span> : "waiting"}</td>
          <td>{p.status.toLowerCase()}</td>
          <td>{open && (convener || p.byId === viewer.id) && <ActionButton url="/api/batch-review" body={{ action: p.status === "WITHDRAWN" ? "keep" : "withdraw", batchId, proposalId: p.id }} label={p.status === "WITHDRAWN" ? "Restore" : "Withdraw"} className="btn btn-secondary btn-sm" />}</td></tr>)}</tbody></table>
    </div>
  ) : null;

  if (lead && !member) {
    // The Program Lead: comparison → checklist → send; then proposals with his opinion; then the final version.
    return (
      <div>
        {st.review?.status === "APPROVED" && <div className="card" style={{ borderLeft: "5px solid #2E7D32" }}><h3 style={{ marginTop: 0 }}>Approved by the OMC — {st.review.decidedByName}, {new Date(st.review.decidedAt).toLocaleDateString("en-GB")}</h3><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13 }}>{st.review.summary}</pre><p className="small-note">This is the final version; the changes are already applied.</p></div>}
        {st.review && st.review.status !== "APPROVED" && <div className="card" style={{ borderLeft: "5px solid #1565C0" }}><b>With the OMC</b> since {new Date(st.review.submittedAt).toLocaleDateString("en-GB")} · endorsed {st.yes} of {st.total}{st.waiting.length ? ` · waiting: ${st.waiting.join(", ")}` : ""}</div>}
        {proposals}
        <div className="card"><h3 style={{ marginTop: 0 }}>New batch · council curriculum · previous batch</h3>{steps[0]}</div>
        {!st.review && <div className="card no-print"><h3 style={{ marginTop: 0 }}>Send to the OMC</h3>
          <p className="small-note">The OMC reviews the comparison, structure, changes, semesters and prerequisites, electives and tracks, Subject Experts and course → GA mapping; members propose changes, you give your opinion, and the Convener finalises.</p>
          <ActionButton url="/api/batch-review" body={{ action: "submit", batchId }} label="Send to the OMC for approval" className="btn" confirmText="Send this batch to the OMC?" /></div>}
      </div>
    );
  }
  const i = Math.min(Math.max(s, 1), REVIEW_STEPS.length);
  return (
    <div>
      <div className="card no-print" style={{ padding: "8px 12px", borderLeft: "5px solid #0D2A4A" }}>
        <b style={{ fontSize: 13 }}>Step {i} of {REVIEW_STEPS.length}: {REVIEW_STEPS[i - 1]}</b>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>{REVIEW_STEPS.map((x, k) => <Link key={x} href={`${base}?s=${k + 1}`} style={{ fontSize: 11.5, textDecoration: "none", padding: "2px 7px", borderRadius: 999, background: k + 1 === i ? "#0D2A4A" : k + 1 < i ? "#E3F1E5" : "#F1F3F6", color: k + 1 === i ? "#fff" : "#333" }}>{k + 1 < i ? "✓" : k + 1}. {x}</Link>)}</div>
        <div style={{ display: "flex", gap: 8 }}>{i > 1 && <Link className="btn btn-secondary btn-sm" href={`${base}?s=${i - 1}`}>← Previous</Link>}{i < REVIEW_STEPS.length && <Link className="btn btn-sm" href={`${base}?s=${i + 1}`}>Next →</Link>}</div>
      </div>
      {st.review?.status === "APPROVED" && <div className="card" style={{ borderLeft: "5px solid #2E7D32" }}><b>Approved</b> — {st.review.decidedByName}, {new Date(st.review.decidedAt).toLocaleDateString("en-GB")}<pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5 }}>{st.review.summary}</pre></div>}
      <div className="card"><h3 style={{ marginTop: 0 }}>{REVIEW_STEPS[i - 1]}</h3>{steps[i - 1]}{member && open && i <= 3 && <div style={{ marginTop: 8 }}>{propose("OTHER", [{ name: "text", label: "Proposal" }])}</div>}</div>
      {proposals}
    </div>
  );
}
