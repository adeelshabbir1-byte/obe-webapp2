import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addItem, addMeeting, addMember, committee, councilNote, finalise, memberFor, newGuestLink, removeMember, saveCommittee, setAttendance, uploadMinutes, vote } from "../../../lib/committeeEngine";
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
