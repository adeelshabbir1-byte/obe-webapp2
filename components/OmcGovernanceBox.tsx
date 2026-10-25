import { prisma } from "../lib/db";
import { omcCommittee } from "../lib/omcCommittee";
import { OVERDUE_DAYS, votesOf, panelOf } from "../lib/omcRules";
import { ActionForm } from "./fyp/FypClient";

// On the OMC Review Queue: in-semester requests with their votes ("Approved by A · waiting 1 of 2"), overdue ones
// flagged, and — for the Convener — giving a course a 3-member panel.
export default async function OmcGovernanceBox({ userId, chairmanId, coordinatorIds }: { userId: string; chairmanId: string; coordinatorIds: string[] }) {
  const com = await omcCommittee(chairmanId, null);
  const convener = com.convenerId === userId;
  const [we, tc] = await Promise.all([
    prisma.weightExceptionRequest.findMany({ where: { status: "pending", course: { coordinatorId: { in: coordinatorIds.concat("none") } } }, select: { id: true, createdAt: true, courseId: true, course: { select: { code: true, title: true } } } }),
    prisma.templateChangeRequest.findMany({ where: { status: "pending", courseId: { in: (await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } }, select: { id: true } })).map((c) => c.id).concat("none") } }, select: { id: true, createdAt: true, courseId: true } }),
  ]);
  const codes = new Map((await prisma.course.findMany({ where: { id: { in: tc.map((t) => t.courseId).concat("none") } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, `${c.code} ${c.title}`]));
  const rows = await Promise.all([
    ...we.map(async (r) => ({ kind: "Weight exception", label: `${r.course.code} ${r.course.title}`, at: r.createdAt, votes: await votesOf("WEIGHT_EXCEPTION", r.id), panel: await panelOf(r.courseId) })),
    ...tc.map(async (r) => ({ kind: "Template change", label: codes.get(r.courseId) || "", at: r.createdAt, votes: await votesOf("TEMPLATE_CHANGE", r.id), panel: await panelOf(r.courseId) })),
  ]);
  const overdue = (d: Date) => Date.now() - new Date(d).getTime() > OVERDUE_DAYS * 864e5;
  const members = com.all.map((id) => [id, com.names.get(id) || "?"] as [string, string]);
  const courses = convener ? await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") }, isOffered: true }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, batch: { select: { batchName: true } } }, take: 500 }) : [];
  if (!rows.length && !convener) return null;
  return (
    <div className="card">
      <b>In-semester requests — 2 approvals decide{com.convenerId ? "" : " (no Convener set on the organisation chart)"}</b>
      {rows.length ? <table style={{ fontSize: 12.5, marginTop: 6, width: "100%" }}><thead><tr><th>Request</th><th>Course</th><th>Waiting since</th><th>Votes</th></tr></thead>
        <tbody>{rows.sort((a, b) => +a.at - +b.at).map((r, i) => <tr key={i} style={{ background: overdue(r.at) ? "#FDECEA" : undefined }}><td>{r.kind}</td><td>{r.label}{r.panel.length ? <span className="small-note"> · panel: {r.panel.map((id) => com.names.get(id) || "?").join(", ")}</span> : null}</td>
          <td>{new Date(r.at).toLocaleDateString("en-GB")}{overdue(r.at) ? <b style={{ color: "#B3261E" }}> ⚑ overdue</b> : null}</td>
          <td>{r.votes.length ? r.votes.map((v) => `${v.userName}: ${v.approve ? "approve" : "reject"}`).join(" · ") : "none yet"} · waiting {Math.min(2, r.votes.filter((v) => v.approve).length)} of 2</td></tr>)}</tbody></table>
        : <p className="small-note">No requests waiting.</p>}
      {convener && <div style={{ marginTop: 8 }}><ActionForm url="/api/omc/panel" fixed={{}} collapsed openLabel="Give a course a 3-member panel" submit="Save panel"
        fields={[{ name: "courseId", label: "Course", type: "select", options: courses.map((c) => [c.id, `${c.code} ${c.title} (${c.batch?.batchName || ""})`] as [string, string]) }, { name: "m1", label: "Member 1", type: "select", options: members }, { name: "m2", label: "Member 2", type: "select", options: members }, { name: "m3", label: "Member 3", type: "select", options: members }]} /></div>}
    </div>
  );
}
