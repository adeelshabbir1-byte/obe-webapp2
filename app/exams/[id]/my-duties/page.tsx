import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { xdb, loadSession, sessionDays, parse, invigilatorPool, examRooms, type ExamPaperRow } from "../../../../lib/exams";
import { ebdb, examChairman, swapMode } from "../../../../lib/examBranch";
import { ActionForm, ActionButton } from "../../../../components/fyp/FypClient";
import ScheduleGrid, { type GridCell } from "../../../../components/ScheduleGrid";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";
type Swap = { id: string; paperId: string; roomId: string; fromUserId: string; toUserId: string; status: string; note: string | null; createdAt: Date };

// A teacher's exam duties as a grid (dates × times), with swaps: direct with a colleague on the day duties are published,
// then by request to the exam branch. The exam branch sees and decides all requests here too.
export default async function MyDuties({ params, searchParams }: { params: { id: string }; searchParams: { who?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== (await chairmanIdFor(user))) notFound();
  const branch = (await examChairman(user)) === s.chairmanId;
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><p className="no-print"><Link href={`/exams/${s.id}`}>← {s.name}</Link></p>{c}</Shell>;
  if (s.status !== "PUBLISHED" && !branch) return shell(<p className="small-note">Duties appear here once the exam branch publishes the date sheet.</p>);
  const swaps = ((await ebdb.dutySwap.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "desc" } }).catch(() => null)) as Swap[] | null);
  if (swaps === null) return shell(<div className="err">Run prisma/migration_exam_branch.sql first.</div>);
  const pool = await invigilatorPool(s.chairmanId);
  const names = new Map(pool.map((p) => [p.id, p.name]));
  const who = branch && searchParams.who && names.has(searchParams.who) ? searchParams.who : user.id;
  const papers = (await xdb.examPaper.findMany({ where: { sessionId: s.id } })) as ExamPaperRow[];
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: papers.map((p) => p.courseId) } }, select: { id: true, code: true, title: true, instructorId: true } })).map((c) => [c.id, c]));
  const rooms = new Map((await examRooms(s)).map((r) => [r.id, r.name]));
  const slots = parse<string[]>(s.slotsJson, []);
  const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const days = (await sessionDays(s)).map((d) => ({ key: day(d), label: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }) }));
  // Who is busy when (so a swap only offers colleagues free at that time).
  const busy = new Map<string, Set<string>>();
  for (const p of papers) if (p.date && p.slot !== null) for (const r of parse<{ userIds: string[] }[]>(p.invigilatorsJson, [])) for (const u of r.userIds) { const k = `${day(p.date)}:${p.slot}`; busy.set(k, new Set([...(busy.get(k) || []), u])); }
  const cells = new Map<string, GridCell[]>(); const duties: { paper: ExamPaperRow; roomId: string; key: string }[] = [];
  for (const p of papers) {
    if (!p.date || p.slot === null) continue;
    const c = courses.get(p.courseId); const k = `${day(p.date)}|${p.slot}`;
    for (const r of parse<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, [])) if (r.userIds.includes(who)) {
      const ex = (cells.get(k) || []).find((x) => x.title.startsWith(`Invigilation · ${rooms.get(r.roomId)}`));
      if (ex) ex.sub = `${ex.sub}, ${c?.code}`; else cells.set(k, [...(cells.get(k) || []), { title: `Invigilation · ${rooms.get(r.roomId) || "room"}`, sub: `${c?.code}`, tone: "duty" }]);
      duties.push({ paper: p, roomId: r.roomId, key: `${day(p.date)}:${p.slot}` });
    }
    if (c?.instructorId === who) cells.set(k, [...(cells.get(k) || []), { title: `Your paper · ${c.code}`, sub: parse<{ roomId: string }[]>(p.roomsJson, []).map((r) => rooms.get(r.roomId)).join(", "), tone: "paper" }]);
  }
  const mode = await swapMode(s.id);
  const incoming = swaps.filter((x) => x.toUserId === user.id && x.status === "PEER");
  const queue = branch ? swaps.filter((x) => x.status === "BRANCH") : [];
  const mineReq = swaps.filter((x) => x.fromUserId === user.id).slice(0, 20);
  const desc = (x: Swap) => { const p = papers.find((q) => q.id === x.paperId); return p?.date ? `${day(p.date)} ${slots[p.slot ?? 0] || ""} · ${rooms.get(x.roomId) || ""} · ${courses.get(p.courseId)?.code || ""}` : "—"; };
  return shell(<>
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><h1 style={{ fontSize: 21, margin: 0 }}>{who === user.id ? "My exam duties" : `Duties of ${names.get(who)}`} — {s.name}</h1><PrintButton label="Print" className="btn btn-secondary btn-sm no-print" /></div>
    {branch && <form className="no-print" style={{ margin: "6px 0" }}><select name="who" defaultValue={who}>{pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> <button className="btn btn-secondary btn-sm">Show</button></form>}
    <div className="card"><ScheduleGrid corner="Date" rows={days} cols={slots.map((t, i) => ({ key: String(i), label: t }))} cells={cells} /></div>
    <div className="card no-print">
      <h3 style={{ marginTop: 0 }}>Change a duty</h3>
      <p className="small-note">{mode === "PEER" ? "Duties were published today: hand a duty directly to a free colleague; it changes as soon as they accept." : "Direct swaps were open only on the day duties were published. Now your request goes to the exam branch for approval."}</p>
      {who === user.id && duties.map((d) => { const free = pool.filter((p) => p.id !== user.id && !busy.get(d.key)?.has(p.id)); return (
        <div key={d.paper.id + d.roomId} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid #E3E9F0", padding: "6px 0", fontSize: 13 }}>
          <span style={{ minWidth: 260 }}>{d.key.split(":")[0]} · {slots[Number(d.key.split(":")[1])]} · {rooms.get(d.roomId)} · {courses.get(d.paper.courseId)?.code}</span>
          <ActionForm url={`/api/exams/${s.id}/swap`} fixed={{ action: "request", paperId: d.paper.id, roomId: d.roomId }} submit={mode === "PEER" ? "Ask colleague" : "Request change"} collapsed openLabel="Swap" initial={{ toUserId: free[0]?.id || "" }} fields={[{ name: "toUserId", label: "Colleague free at that time", type: "select", options: free.map((p) => [p.id, p.name] as [string, string]) }, { name: "note", label: "Reason", width: 220 }]} />
        </div>); })}
      {who === user.id && !duties.length && <p className="small-note">No invigilation duties.</p>}
      {branch && who !== user.id && duties.map((d) => { const free = pool.filter((p) => p.id !== who && !busy.get(d.key)?.has(p.id)); return (
        <div key={d.paper.id + d.roomId} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid #E3E9F0", padding: "6px 0", fontSize: 13 }}>
          <span style={{ minWidth: 260 }}>{d.key.split(":")[0]} · {slots[Number(d.key.split(":")[1])]} · {rooms.get(d.roomId)} · {courses.get(d.paper.courseId)?.code}</span>
          <ActionForm url={`/api/exams/${s.id}/swap`} fixed={{ action: "assign", paperId: d.paper.id, roomId: d.roomId, fromUserId: who }} submit="Reassign" collapsed openLabel="Reassign" initial={{ toUserId: free[0]?.id || "" }} fields={[{ name: "toUserId", label: "Give this duty to", type: "select", options: free.map((p) => [p.id, p.name] as [string, string]) }, { name: "note", label: "Reason", width: 220 }]} />
        </div>); })}
    </div>
    {incoming.length > 0 && <div className="card no-print"><h3 style={{ marginTop: 0 }}>Asked of you</h3>{incoming.map((x) => <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}><span>{names.get(x.fromUserId)} asks you to take: {desc(x)}{x.note ? ` — ${x.note}` : ""}</span><ActionButton url={`/api/exams/${s.id}/swap`} body={{ action: "decide", swapId: x.id, accept: true }} label="Accept" /><ActionButton url={`/api/exams/${s.id}/swap`} body={{ action: "decide", swapId: x.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" /></div>)}</div>}
    {queue.length > 0 && <div className="card no-print"><h3 style={{ marginTop: 0 }}>Requests to the exam branch</h3>{queue.map((x) => <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}><span>{names.get(x.fromUserId)} → {names.get(x.toUserId)}: {desc(x)}{x.note ? ` — ${x.note}` : ""}</span><ActionButton url={`/api/exams/${s.id}/swap`} body={{ action: "decide", swapId: x.id, accept: true }} label="Approve" /><ActionButton url={`/api/exams/${s.id}/swap`} body={{ action: "decide", swapId: x.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" /></div>)}</div>}
    {mineReq.length > 0 && <div className="card no-print"><h3 style={{ marginTop: 0 }}>My requests</h3>{mineReq.map((x) => <div key={x.id} style={{ fontSize: 13 }}>{desc(x)} → {names.get(x.toUserId)} · <b>{x.status === "PEER" ? "waiting for colleague" : x.status === "BRANCH" ? "waiting for exam branch" : x.status.toLowerCase()}</b> {["PEER", "BRANCH"].includes(x.status) && <ActionButton url={`/api/exams/${s.id}/swap`} body={{ action: "cancel", swapId: x.id }} label="Cancel" className="btn btn-secondary btn-sm" />}</div>)}</div>}
  </>);
}
