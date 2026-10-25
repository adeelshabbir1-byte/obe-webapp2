import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { prisma } from "../../lib/db";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { UC_HINT, REC_STATUS, recsFor } from "../../lib/universityCurriculum";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum Changes" };

const COL: Record<string, string> = { OMC_REVIEW: "#B26A00", BATCH_ONLY: "#6B7177", BOS_PENDING: "#1565C0", BOS_DEFERRED: "#8A5A0F", BOS_APPROVED: "#2E7D32", BOS_REJECTED: "#B3261E", APPLIED: "#1E6B34" };

// Changes from a batch on their way to the university curriculum: SE proposes → OMC (this batch only / recommend) →
// BOS (approve with minutes) → OMC forwards → new revision.
export default async function CurriculumChanges({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (!chairmanId) redirect("/dashboard");
  let rows: Awaited<ReturnType<typeof recsFor>>;
  try { rows = await recsFor(chairmanId); } catch { return shell(<div className="err">{UC_HINT}</div>); }
  if (user.role === "SUBJECT_EXPERT" || user.role === "INSTRUCTOR") rows = rows.filter((r) => r.proposedById === user.id);
  const isOmc = user.role === "OMC", isBos = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"].includes(user.role);
  const minutes = isBos ? await prisma.meetingMinutes.findMany({ where: { chairmanId, kind: "BOS" }, orderBy: { meetingDate: "desc" }, take: 30, select: { id: true, title: true, meetingDate: true, data: true } }) : [];
  const open = rows.filter((r) => !["APPLIED", "BATCH_ONLY", "BOS_REJECTED"].includes(r.status));
  const shown = searchParams.show === "all" ? rows : open;
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curriculum Changes</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Changes made in a batch reach the <b>university curriculum</b> (what new batches get) only this way: the Subject Expert proposes → the <b>OMC</b> keeps it for this batch only or recommends it → the <b>Board of Studies</b> approves it, with its signed minutes → the <b>OMC forwards</b> it, making a new revision. Running batches are told, not changed. <Link href={searchParams.show === "all" ? "/curriculum-changes" : "/curriculum-changes?show=all"}>{searchParams.show === "all" ? "Open items only" : "Show all, including closed"}</Link></p>
    {isBos && <div className="card small-note" style={{ marginTop: 0 }}>BOS list: <b>{rows.filter((r) => r.status === "BOS_PENDING" || r.status === "BOS_DEFERRED").length}</b> item(s) for the next meeting. Record the meeting and upload its signed minutes under <Link href="/meetings">Meetings (BOS)</Link>, then mark each item.</div>}
    {shown.length === 0 ? <div className="card small-note">Nothing here. A Subject Expert proposes a change from their course&apos;s CLO page (or the Delivery page, adopting the teacher&apos;s version).</div> : shown.map((r) => (
      <div key={r.id} className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <b>{r.course?.code} {r.course?.title} <span className="small-note">{r.course?.batch?.degreeProgram} — {r.course?.batch?.batchName}</span></b>
          <span style={{ fontSize: 12, fontWeight: 700, color: COL[r.status] }}>{REC_STATUS[r.status] || r.status}{r.revision ? ` · rev ${r.revision}` : ""}</span>
        </div>
        <p style={{ margin: "4px 0", fontSize: 13 }}>{r.summary}</p>
        <div className="small-note" style={{ margin: 0 }}>{r.kind === "INSTRUCTOR_ADOPTED" ? "Teacher's version adopted by the Subject Expert" : "Subject Expert's plan"} · proposed by {r.by} · {r.createdAt.toISOString().slice(0, 10)}{r.reason ? ` · ${r.reason}` : ""}{r.bosNote ? ` · BOS: ${r.bosNote}` : ""}{r.bosItem ? ` (item ${r.bosItem})` : ""}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Link className="btn btn-secondary btn-sm" href={`/omc/reports/course-description?courseId=${r.courseId}`}>Course description</Link>
          {isOmc && r.status === "OMC_REVIEW" && <>
            <ActionButton showMessage url="/api/curriculum-changes" body={{ action: "omc", id: r.id, decision: "BOS_PENDING" }} label="Recommend to BOS for future batches" className="btn btn-sm" askNote="Note for the Board of Studies (optional)" />
            <ActionButton showMessage url="/api/curriculum-changes" body={{ action: "omc", id: r.id, decision: "BATCH_ONLY" }} label="This batch only" className="btn btn-secondary btn-sm" askNote="Why only this batch? (e.g. strike, lost weeks)" noteRequired />
          </>}
          {isOmc && r.status === "BOS_APPROVED" && <ActionButton showMessage url="/api/curriculum-changes" body={{ action: "forward", id: r.id }} label="Forward to the university curriculum" className="btn btn-brass btn-sm" confirmText="Write this plan into the university curriculum as a new revision? New batches get it." />}
          {isBos && (r.status === "BOS_PENDING" || r.status === "BOS_DEFERRED") && <ActionForm showMessage url="/api/curriculum-changes" fixed={{ action: "bos", id: r.id }} submit="Record BOS decision" collapsed openLabel="Record the BOS decision…"
            initial={{ decision: "BOS_APPROVED", minutesId: minutes.find((m) => m.data)?.id || "" }}
            fields={[{ name: "decision", label: "Decision", type: "select", options: [["BOS_APPROVED", "Approved"], ["BOS_REJECTED", "Rejected"], ["BOS_DEFERRED", "Deferred"]] }, { name: "minutesId", label: "BOS meeting (signed minutes)", type: "select", options: [["", minutes.length ? "Choose…" : "No BOS meeting recorded yet"], ...minutes.map((m) => [m.id, `${m.meetingDate.toISOString().slice(0, 10)} ${m.title}${m.data ? "" : " (no minutes file yet)"}`] as [string, string])], width: 260 }, { name: "item", label: "Item no.", width: 70 }, { name: "note", label: "Note", width: 220 }]} />}
        </div>
      </div>))}
  </>);
}
