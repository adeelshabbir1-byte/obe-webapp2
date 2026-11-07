import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { WG_HINT, broadcastsFor } from "../../lib/workflowGaps";
import { LabAck, LabSend } from "../../components/WorkflowForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labs in lockstep" };

// Queue item 19: the lead teacher of a lab course sends the week's lab to the lab engineers of every campus at once;
// each confirms the lab ran; marks come back on the same rubric.
export default async function LabBroadcastPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const mine = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: cid }, OR: [{ instructorId: user.id }, { labEngineerId: user.id }], labEngineerId: { not: null } }, select: { id: true, code: true, instructorId: true, labEngineerId: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const codes = Array.from(new Set(mine.map((c) => c.code)));
  const teach = Array.from(new Set(mine.filter((c) => c.instructorId === user.id).map((c) => c.code)));
  const list = await broadcastsFor(cid, codes);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: (list || []).flatMap((b) => [b.sentById, ...b.acks.map((a) => a.userId)]).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Labs in lockstep</h1>
      <p className="small-note" style={{ marginTop: 0 }}>One lab, run the same way on every campus: the lead teacher sends the week&apos;s instructions and rubric checkpoints; each campus&apos;s lab engineer confirms the lab ran; lab marks are entered on the same rubric.</p>
      {list === null ? <div className="card">{WG_HINT}</div> : <>
        {teach.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Send this week&apos;s lab</h3><LabSend codes={teach} /></div>}
        {!codes.length && <p className="small-note">You teach or run no lab course this term.</p>}
        {list.map((b) => <div key={b.id} className="card"><b>{b.courseCode} · week {b.week}</b> <span className="small-note">from {names.get(b.sentById)} · {b.at.toISOString().slice(0, 10)}</span>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: "6px 0" }}>{b.instructions}</pre>{b.rubric && <div className="small-note">Rubric: {b.rubric}</div>}
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Ran on: {b.acks.length ? b.acks.map((a) => `${names.get(a.userId)}${a.note ? ` (${a.note})` : ""}`).join(", ") : "not confirmed yet"}</div>
          {mine.some((c) => c.code === b.courseCode && c.labEngineerId === user.id) && <div style={{ marginTop: 4 }}><LabAck broadcastId={b.id} courses={mine.filter((c) => c.code === b.courseCode && c.labEngineerId === user.id).map((c) => ({ id: c.id, label: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}` }))} /></div>}</div>)}
      </>}
    </Shell>
  );
}
