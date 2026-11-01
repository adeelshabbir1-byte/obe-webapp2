import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addItem, addMeeting, addMember, committee, manages, councilNote, finalise, memberFor, newGuestLink, removeMember, saveCommittee, setAttendance, uploadMinutes, vote } from "../../../lib/committeeEngine";
import type { Outcome, VoteKind } from "../../../lib/committeeCore";

/**
 * POST — committees (JSON, or multipart when a PDF is attached).
 *   save { id?, type, scope, scopeId, name, mode, quorumPct, majorityPct, convenerId, councilStep }
 *   addMember { committeeId, userId | name, email, organisation }   removeMember { memberId }   guestLink { memberId }
 *   meeting { committeeId, date, venue }   attendance { meetingId, present[] }   item { committeeId, title, summary, meetingId }
 *   vote { itemId, committeeId, vote, comment }   finalise { itemId, outcome, note, meetingDate, file }
 *   council { itemId, status, date, file }   minutes { meetingId, file }
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const multipart = (req.headers.get("content-type") || "").includes("multipart/form-data");
  let b: Record<string, any> = {};
  let file: { buf: Buffer; name: string; type: string } | null = null;
  if (multipart) {
    const fd = await req.formData();
    fd.forEach((v, k) => { if (typeof v === "string") b[k] = v; });
    const f = fd.get("file");
    if (f && typeof f !== "string" && f.size > 0) {
      if (f.size > 15 * 1024 * 1024) return NextResponse.json({ error: "The file is over 15 MB." }, { status: 400 });
      if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return NextResponse.json({ error: "Attach a PDF." }, { status: 400 });
      file = { buf: Buffer.from(await f.arrayBuffer()), name: f.name, type: f.type || "application/pdf" };
    }
  } else b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const mine = async (id: string) => { const c = await committee(id); if (!c || c.chairmanId !== chairmanId) throw new Error("Committee not found."); return c; };
  try {
    switch (b.action) {
      case "save": return NextResponse.json({ ok: true, id: await saveCommittee(user, chairmanId, b) });
      case "addMember": { await mine(String(b.committeeId)); const r = await addMember(user, String(b.committeeId), { userId: b.userId || null, name: b.name, email: b.email, organisation: b.organisation }); return NextResponse.json({ ok: true, ...r, message: r.link ? `Guest link (copy it now — it is shown once): ${new URL(r.link, req.url).toString()}` : "Added." }); }
      // Members made easy (UX review): roles and terms, Secretary, bulk add, replace with history, composition rule.
      case "memberMeta": { const c = await mine(String(b.committeeId)); if (!(await manages(user, c))) throw new Error("Only the Convener or Secretary changes members."); const M = await import("../../../lib/committeeMeta"); const m = await M.metaOf(c.chairmanId, c.id); m.roles[String(b.memberId)] = { role: M.CMT_ROLES.includes(String(b.role)) ? String(b.role) : "Member", from: String(b.from || "") || undefined, until: String(b.until || "") || undefined }; await M.saveMeta(c.chairmanId, c.id, m, user.id); return NextResponse.json({ ok: true }); }
      case "secretary": { const c = await mine(String(b.committeeId)); if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new Error("The Dean, HOD or Institute Head names the Secretary."); const M = await import("../../../lib/committeeMeta"); const m = await M.metaOf(c.chairmanId, c.id); const { prisma } = await import("../../../lib/db"); const u = b.userId ? await prisma.user.findUnique({ where: { id: String(b.userId) }, select: { id: true, name: true } }) : null; m.secretaryId = u?.id; m.secretaryName = u?.name; await M.saveMeta(c.chairmanId, c.id, m, user.id); if (u) { await addMember(user, c.id, { userId: u.id }).catch(() => null); await (await import("../../../lib/notifications")).notifyUsers([u.id], { kind: "ASSIGNMENT", title: `You are the Secretary of ${c.name}`, body: "You manage its members, meetings and minutes.", href: `/boards/${c.id}` }).catch(() => null); } return NextResponse.json({ ok: true }); }
      case "bulkAdd": { const c = await mine(String(b.committeeId)); const { prisma } = await import("../../../lib/db"); const emails = String(b.emails || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")); const byEmail = emails.length ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }) : []; const ids = Array.from(new Set([...(Array.isArray(b.userIds) ? b.userIds.map(String) : []), ...byEmail.map((u) => u.id)])); let n = 0; for (const id of ids) { const r = await addMember(user, c.id, { userId: id }); if (r.id) n++; } const unknown = emails.filter((e) => !byEmail.some((u) => (u.email || "").toLowerCase() === e)); return NextResponse.json({ ok: true, message: `${n} added.${unknown.length ? ` Not found: ${unknown.join(", ")} — add them as external members.` : ""}` }); }
      case "replaceMember": { const c = await mine(String(b.committeeId)); if (!(await manages(user, c))) throw new Error("Only the Convener or Secretary replaces members."); const M = await import("../../../lib/committeeMeta"); const m = await M.metaOf(c.chairmanId, c.id); const old = (await (await import("../../../lib/committeeEngine")).membersOf(c.id)).find((x) => x.id === String(b.memberId)); if (!old) throw new Error("Member not found."); const r = await addMember(user, c.id, { userId: String(b.userId) }); const role = m.roles[old.id]; await removeMember(user, old.id); if (r.id && role) m.roles[r.id] = { ...role, from: new Date().toISOString().slice(0, 10) }; delete m.roles[old.id]; m.history.push({ at: new Date().toISOString(), by: user.name, out: old.name, in: String(b.userId), note: String(b.note || "") }); await M.saveMeta(c.chairmanId, c.id, m, user.id); return NextResponse.json({ ok: true }); }
      case "rules": { const c = await mine(String(b.committeeId)); if (!(await manages(user, c))) throw new Error("Only the Convener, Secretary or the head of its scope sets the composition."); const M = await import("../../../lib/committeeMeta"); const m = await M.metaOf(c.chairmanId, c.id); m.rules = (Array.isArray(b.rules) ? b.rules : []).filter((r: { role: string }) => M.CMT_ROLES.includes(String(r.role))).map((r: { role: string; min: unknown }) => ({ role: String(r.role), min: Math.max(0, Math.min(50, Number(r.min) || 0)) })); await M.saveMeta(c.chairmanId, c.id, m, user.id); return NextResponse.json({ ok: true }); }
      case "removeMember": await removeMember(user, String(b.memberId)); return NextResponse.json({ ok: true });
      case "guestLink": { const l = await newGuestLink(user, String(b.memberId)); return NextResponse.json({ ok: true, message: `New guest link (the old one stops working): ${new URL(l, req.url).toString()}` }); }
      case "meeting": await mine(String(b.committeeId)); return NextResponse.json({ ok: true, id: await addMeeting(user, String(b.committeeId), { date: b.date, venue: b.venue }) });
      case "attendance": await setAttendance(user, String(b.meetingId), Array.isArray(b.present) ? b.present.map(String) : Object.keys(b).filter((k) => k.startsWith("m_") && (b[k] === true || b[k] === "true")).map((k) => k.slice(2))); return NextResponse.json({ ok: true });
      case "item": { const c = await mine(String(b.committeeId)); if (!(c.convenerId === user.id || (await memberFor(user.id, c.id)) || ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role))) throw new Error("Only members add items."); return NextResponse.json({ ok: true, id: await addItem(user, c.id, { title: String(b.title || ""), summary: b.summary || null, meetingId: b.meetingId || null }) }); }
      case "vote": { const m = await memberFor(user.id, String(b.committeeId)); if (!m) throw new Error("Only members of this committee vote."); await vote(m.id, String(b.itemId), b.vote as VoteKind, String(b.comment || "")); return NextResponse.json({ ok: true }); }
      case "finalise": await finalise(user, String(b.itemId), { outcome: b.outcome as Outcome, note: b.note, meetingDate: b.meetingDate || undefined, signed: file }); return NextResponse.json({ ok: true });
      case "council": await councilNote(user, String(b.itemId), { status: b.status === "APPROVED" ? "APPROVED" : "NOTED", date: String(b.date || ""), doc: file }); return NextResponse.json({ ok: true });
      case "minutes": if (!file) throw new Error("Attach the signed minutes (PDF)."); await uploadMinutes(user, String(b.meetingId), file); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
