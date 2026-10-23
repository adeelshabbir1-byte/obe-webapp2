import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, str, num, dateOrNull } from "../../../lib/registers";
import { approverFor } from "../../../lib/approvers";
import { rdb2, REC_HINT, DESIGNATIONS, DEFAULT_WEIGHTS, raiseRequest, decideRequest, advertText, newToken, merit, join, hiringRecord, type Request as HiringReq, type Application } from "../../../lib/recruitment";
import { issueDocument, signersFrom } from "../../../lib/signoff";
import { docxSignOff } from "../../../lib/signoffDocx";
import { titlesFor, applyTitles } from "../../../lib/titles";

async function who() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const w = await whoIs(user as never);
  return w ? { user, w } : null;
}
type Me = NonNullable<Awaited<ReturnType<typeof who>>>;
/** Who manages an advertisement: the Institute Head, the Dean, the HOD who asked for it, and the selection board. */
async function manages(me: Me, requestId: string) {
  const r = (await rdb2.hiringRequest.findUnique({ where: { id: requestId } })) as HiringReq | null;
  if (!r || r.chairmanId !== me.w.chairmanId) return null;
  if (me.w.head || me.w.dean || r.raisedById === me.user.id || (me.w.hod && me.user.departmentId === r.departmentId)) return r;
  const ad = await rdb2.jobAdvert.findFirst({ where: { requestId } }); const b = ad ? await rdb2.selectionBoard.findUnique({ where: { advertId: ad.id } }) : null;
  return b && (JSON.parse(b.membersJson || "[]") as string[]).includes(me.user.id) ? r : null;
}
async function appAndReq(me: Me, applicationId: string) {
  const a = (await rdb2.jobApplication.findUnique({ where: { id: applicationId } })) as Application | null;
  if (!a) return null;
  const ad = await rdb2.jobAdvert.findUnique({ where: { id: a.advertId } });
  const r = ad ? await manages(me, ad.requestId) : null;
  return r ? { a, ad, r } : null;
}

/** GET ?offer=<applicationId> (Word) · ?cv=<applicationId> (the CV) · ?record=1 (hiring record, Excel). */
export async function GET(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("record")) {
      if (!(me.w.head || me.w.dean || me.w.hod || me.w.qec)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const rows = await hiringRecord(me.w.chairmanId);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Faculty hiring record");
      ws.addRow(["Faculty hiring record (NBEAC Appendix 4C)"]).font = { bold: true, size: 13 };
      ws.addRow(["Position", "Designation", "Area", "Posts", "Advertised on", "Applicants", "Eligible", "Shortlisted", "Selected", "Joined", "Days from request to joining"]).font = { bold: true };
      for (const r of rows) ws.addRow([r.title, r.designation, r.area, r.positions, new Date(r.advertised).toLocaleDateString("en-GB"), r.applicants, r.eligible, r.shortlisted, r.selected, r.joined, r.daysToHire ?? "—"]);
      ws.columns.forEach((c) => { c.width = 18; });
      return new NextResponse((await wb.xlsx.writeBuffer()) as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Faculty hiring record.xlsx"' } });
    }
    const id = q.get("offer") || q.get("cv") || "";
    const x = await appAndReq(me, id);
    if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (q.get("cv")) {
      const full = await rdb2.jobApplication.findUnique({ where: { id }, select: { cvName: true, cvType: true, cvData: true } });
      if (!full?.cvData) return NextResponse.json({ error: "No CV uploaded." }, { status: 404 });
      return new NextResponse(Buffer.from(full.cvData, "base64"), { headers: { "Content-Type": full.cvType || "application/octet-stream", "Content-Disposition": `attachment; filename="${(full.cvName || "cv").replace(/[^\w .-]/g, "")}"` } });
    }
    // The offer letter (Word), signed off from the Institute Head's approval of the board's recommendation.
    if (!["SELECTED", "OFFERED", "JOINED"].includes(x.a.status)) return NextResponse.json({ error: "Only a selected candidate gets an offer letter." }, { status: 400 });
    const board = await rdb2.selectionBoard.findUnique({ where: { advertId: x.ad.id } });
    const head = await prisma.user.findUnique({ where: { id: me.w.chairmanId }, select: { instituteName: true } });
    const dept = x.r.departmentId ? await prisma.department.findUnique({ where: { id: x.r.departmentId }, select: { name: true } }) : null;
    const titles = await titlesFor(me.w.chairmanId);
    const issued = await issueDocument({ chairmanId: me.w.chairmanId, kind: "OFFER_LETTER", title: `${DESIGNATIONS[x.r.designation]} — ${x.r.area}`, holderName: x.a.name, holderRef: x.a.email, sourceRef: `offer:${x.a.id}`, content: { app: x.a.id, designation: x.r.designation, area: x.r.area, approvedAt: board?.approvedAt },
      summary: { "Position": `${DESIGNATIONS[x.r.designation]}, ${x.r.area}`, "Department": dept?.name || "—", "Candidate": x.a.name }, signers: await signersFrom(me.w.chairmanId, [{ userId: board?.approvedById, role: "Appointment approved", at: board?.approvedAt }]), issuedById: me.user.id });
    const p = (t: string, o: { bold?: boolean; size?: number; center?: boolean } = {}) => new Paragraph({ alignment: o.center ? AlignmentType.CENTER : undefined, spacing: { after: 160 }, children: [new TextRun({ text: t, bold: o.bold, size: o.size || 22 })] });
    const doc = new Document({ sections: [{ children: [
      p(head?.instituteName || "", { bold: true, size: 30, center: true }), p("OFFER OF APPOINTMENT", { bold: true, size: 26, center: true }), p(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })),
      p(`Dear ${x.a.name},`),
      p(`On the recommendation of the Selection Board, and with the approval of the ${applyTitles("Institute Head", titles)}, we are pleased to offer you the position of ${DESIGNATIONS[x.r.designation]} (${x.r.area})${dept ? ` in the ${dept.name}` : ""}.`),
      p("The terms and conditions (pay scale, allowances, probation and duties) are as per the institute's service rules, a copy of which is enclosed. Please report to the office of the Registrar with your original documents within fifteen days of this letter to join."),
      p("Kindly confirm your acceptance in writing. This offer lapses if you do not join within the period above."),
      p("Yours sincerely,"),
      ...docxSignOff(issued),
    ] }] });
    if (x.a.status === "SELECTED") await rdb2.jobApplication.update({ where: { id: x.a.id }, data: { status: "OFFERED", offerSentAt: new Date() } });
    return new NextResponse((await Packer.toBuffer(doc)) as unknown as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="Offer letter - ${x.a.name.replace(/[^\w .-]/g, "")}.docx"` } });
  } catch (e) { return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(String(e)) ? REC_HINT : String((e as Error).message || e).slice(0, 300) }, { status: 400 }); }
}

/**
 * POST { action, ... }
 *   raise { designation, area, positions, justification, departmentId? }   decide { id, approve, note }
 *   advertise { requestId, closeAt, text?, qualification, experience, publications, interview }   closeAdvert { id }
 *   override { applicationId, on, reason }   shortlist { applicationId, on }
 *   board { advertId, members (ids, comma separated), interviewAt, venue }   mark { applicationId, marks, remarks }
 *   recommend { advertId, applicationIds }   approveBoard { advertId, approve, note }   join { applicationId, username, password }   declined { applicationId }
 */
export async function POST(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const by = { id: me.user.id };
  try {
    switch (b.action) {
      case "raise": {
        if (!(me.w.hod || me.w.dean || me.w.head)) return NextResponse.json({ error: "A Head of Department (or the Dean / Institute Head) raises a request to hire." }, { status: 403 });
        const dept = me.w.hod ? me.user.departmentId || null : str(b.departmentId) || me.user.departmentId || null;
        await raiseRequest(by, me.w.chairmanId, dept, { designation: str(b.designation), area: str(b.area, 200), positions: Number(b.positions) || 1, justification: str(b.justification, 3000) });
        return NextResponse.json({ ok: true, message: "Sent for approval." });
      }
      case "decide": await decideRequest(by, str(b.id), b.approve === true || b.approve === "true", str(b.note, 1000)); return NextResponse.json({ ok: true });
      case "advertise": {
        const r = await manages(me, str(b.requestId));
        if (!r || r.status !== "APPROVED") return NextResponse.json({ error: "Only an approved request can be advertised." }, { status: 400 });
        if (await rdb2.jobAdvert.findFirst({ where: { requestId: r.id } })) return NextResponse.json({ error: "Already advertised." }, { status: 400 });
        const close = dateOrNull(b.closeAt); if (!close || close < new Date()) return NextResponse.json({ error: "Give a closing date in the future." }, { status: 400 });
        close.setHours(23, 59, 0, 0);
        const w = { qualification: num(b.qualification) ?? DEFAULT_WEIGHTS.qualification, experience: num(b.experience) ?? DEFAULT_WEIGHTS.experience, publications: num(b.publications) ?? DEFAULT_WEIGHTS.publications, interview: num(b.interview) ?? DEFAULT_WEIGHTS.interview };
        if (Math.round(w.qualification + w.experience + w.publications + w.interview) !== 100) return NextResponse.json({ error: "The weights must add up to 100." }, { status: 400 });
        const id = randomUUID();
        await rdb2.jobAdvert.create({ data: { id, chairmanId: me.w.chairmanId, requestId: r.id, title: `${DESIGNATIONS[r.designation]} — ${r.area}`, text: str(b.text, 8000) || (await advertText(r, close)), openFrom: new Date(), closeAt: close, token: newToken(), weightsJson: JSON.stringify(w), createdById: me.user.id } });
        await writeAuditLog({ actorUserId: me.user.id, action: "JOB_ADVERTISED", entityType: "JobAdvert", entityId: id, metadata: { request: r.id } });
        return NextResponse.json({ ok: true });
      }
      case "closeAdvert": {
        const ad = await rdb2.jobAdvert.findUnique({ where: { id: str(b.id) } });
        if (!ad || !(await manages(me, ad.requestId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
        await rdb2.jobAdvert.update({ where: { id: ad.id }, data: { status: "CLOSED" } }); return NextResponse.json({ ok: true });
      }
      case "override": {
        const x = await appAndReq(me, str(b.applicationId)); if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const on = b.on === true || b.on === "true"; const reason = str(b.reason || b.note, 500);
        if (on && reason.length < 5) return NextResponse.json({ error: "Give the reason for accepting a candidate who does not meet the automatic check." }, { status: 400 });
        await rdb2.jobApplication.update({ where: { id: x.a.id }, data: { override: on, overrideReason: on ? reason : null } });
        await writeAuditLog({ actorUserId: me.user.id, action: on ? "ELIGIBILITY_OVERRIDDEN" : "ELIGIBILITY_OVERRIDE_REMOVED", entityType: "JobApplication", entityId: x.a.id, metadata: { reason: reason.slice(0, 200) } });
        return NextResponse.json({ ok: true });
      }
      case "shortlist": {
        const x = await appAndReq(me, str(b.applicationId)); if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const on = b.on === true || b.on === "true";
        if (on && !(x.a.eligible || x.a.override)) return NextResponse.json({ error: "Not eligible — accept with a reason first." }, { status: 400 });
        await rdb2.jobApplication.update({ where: { id: x.a.id }, data: { status: on ? "SHORTLISTED" : "NOT_SHORTLISTED" } }); return NextResponse.json({ ok: true });
      }
      case "board": {
        const ad = await rdb2.jobAdvert.findUnique({ where: { id: str(b.advertId) } });
        if (!ad || !(me.w.head || me.w.dean || (await manages(me, ad.requestId))?.raisedById === me.user.id)) return NextResponse.json({ error: "The Institute Head, the Dean or the HOD who asked sets up the board." }, { status: 403 });
        const members = Array.from(new Set([...(Array.isArray(b.members) ? b.members : str(b.members, 2000).split(",")), ...["m1", "m2", "m3", "m4", "m5"].map((k) => str(b[k]))].map((x: string) => String(x).trim()).filter(Boolean))).slice(0, 9);
        const staffIds = new Set((await prisma.user.findMany({ where: { id: { in: members.concat(["none"]) }, OR: [{ id: me.w.chairmanId }, { managedById: me.w.chairmanId }, { managedBy: { managedById: me.w.chairmanId } }] }, select: { id: true } })).map((u) => u.id));
        const ok = members.filter((m: string) => staffIds.has(m)); if (ok.length < 2) return NextResponse.json({ error: "Choose at least two board members from your staff." }, { status: 400 });
        const data = { membersJson: JSON.stringify(ok), interviewAt: b.interviewAt ? new Date(String(b.interviewAt)) : null, venue: str(b.venue, 200) || null };
        await rdb2.selectionBoard.upsert({ where: { advertId: ad.id }, create: { id: randomUUID(), advertId: ad.id, ...data }, update: data });
        await notifyUsers(ok, { kind: "REQUEST", title: `Selection board: ${ad.title}`, body: data.interviewAt ? `Interviews ${new Date(data.interviewAt).toLocaleString("en-GB")}${data.venue ? `, ${data.venue}` : ""}. Enter your marks for each candidate.` : "Enter your marks for each candidate.", href: "/recruitment?tab=board" });
        return NextResponse.json({ ok: true });
      }
      case "mark": {
        const x = await appAndReq(me, str(b.applicationId)); if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const board = await rdb2.selectionBoard.findUnique({ where: { advertId: x.ad.id } });
        if (!board || !(JSON.parse(board.membersJson) as string[]).includes(me.user.id)) return NextResponse.json({ error: "Only board members give marks." }, { status: 403 });
        if (board.approvedAt) return NextResponse.json({ error: "The recommendation is already approved." }, { status: 400 });
        const marks = Number(b.marks); if (!(marks >= 0 && marks <= 100)) return NextResponse.json({ error: "Marks out of 100." }, { status: 400 });
        await rdb2.boardMark.upsert({ where: { boardId_applicationId_memberId: { boardId: board.id, applicationId: x.a.id, memberId: me.user.id } }, create: { id: randomUUID(), boardId: board.id, applicationId: x.a.id, memberId: me.user.id, marks, remarks: str(b.remarks, 500) || null }, update: { marks, remarks: str(b.remarks, 500) || null, at: new Date() } });
        return NextResponse.json({ ok: true });
      }
      case "recommend": {
        const ad = await rdb2.jobAdvert.findUnique({ where: { id: str(b.advertId) } }); const r = ad ? await manages(me, ad.requestId) : null;
        const board = ad ? await rdb2.selectionBoard.findUnique({ where: { advertId: ad.id } }) : null;
        if (!ad || !r || !board) return NextResponse.json({ error: "Set up the board first." }, { status: 400 });
        const m = await merit(ad.id);
        const ids = (Array.isArray(b.applicationIds) ? b.applicationIds : str(b.applicationIds, 2000).split(",")).map((x: string) => x.trim()).filter(Boolean);
        const chosen = ids.length ? ids : m.rows.filter((x) => x.ok && x.a.status === "SHORTLISTED").slice(0, r.positions).map((x) => x.a.id);
        if (!chosen.length) return NextResponse.json({ error: "No shortlisted candidate to recommend." }, { status: 400 });
        await rdb2.selectionBoard.update({ where: { id: board.id }, data: { recommendationJson: JSON.stringify(chosen), recommendedAt: new Date() } });
        const heads = (await approverFor(me.w.chairmanId, "INSTITUTE_HEAD")).ids;
        await notifyUsers(heads, { kind: "REQUEST", title: `Selection board recommends: ${ad.title}`, body: `${chosen.length} candidate(s) in merit order — your approval.`, href: "/approvals" });
        return NextResponse.json({ ok: true, message: "Sent to the Institute Head for approval." });
      }
      case "approveBoard": {
        const ad = await rdb2.jobAdvert.findUnique({ where: { id: str(b.advertId) } }); const board = ad ? await rdb2.selectionBoard.findUnique({ where: { advertId: ad.id } }) : null;
        if (!ad || !board?.recommendedAt || board.approvedAt) return NextResponse.json({ error: "Nothing is waiting for approval." }, { status: 400 });
        if (!(await approverFor(ad.chairmanId, "INSTITUTE_HEAD")).ids.includes(me.user.id)) return NextResponse.json({ error: "Only the Institute Head (or whoever acts for them) approves appointments." }, { status: 403 });
        const approve = b.approve === true || b.approve === "true";
        if (!approve) { if (str(b.note).length < 3) return NextResponse.json({ error: "Say why it is returned." }, { status: 400 }); await rdb2.selectionBoard.update({ where: { id: board.id }, data: { recommendedAt: null } }); await notifyUsers(JSON.parse(board.membersJson), { kind: "REQUEST", title: `Recommendation returned: ${ad.title}`, body: str(b.note, 300), href: "/recruitment?tab=board" }); return NextResponse.json({ ok: true }); }
        const chosen = JSON.parse(board.recommendationJson || "[]") as string[];
        await rdb2.selectionBoard.update({ where: { id: board.id }, data: { approvedById: me.user.id, approvedAt: new Date() } });
        await rdb2.jobApplication.updateMany({ where: { advertId: ad.id, id: { in: chosen } }, data: { status: "SELECTED" } });
        await rdb2.jobApplication.updateMany({ where: { advertId: ad.id, id: { notIn: chosen.concat(["none"]) }, status: "SHORTLISTED" }, data: { status: "NOT_SELECTED" } });
        await writeAuditLog({ actorUserId: me.user.id, action: "APPOINTMENT_APPROVED", entityType: "JobAdvert", entityId: ad.id, metadata: { selected: chosen.length } });
        return NextResponse.json({ ok: true });
      }
      case "join": {
        const x = await appAndReq(me, str(b.applicationId)); if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
        if (!(me.w.head || me.w.dean || me.w.hod)) return NextResponse.json({ error: "The Institute Head, Dean or HOD records the joining." }, { status: 403 });
        await join(by, x.a.id, str(b.username, 60), typeof b.password === "string" ? b.password : "");
        return NextResponse.json({ ok: true, message: "Joined: the account and faculty profile are made. They must change the password when they first sign in." });
      }
      case "declined": {
        const x = await appAndReq(me, str(b.applicationId)); if (!x) return NextResponse.json({ error: "Not found." }, { status: 404 });
        await rdb2.jobApplication.update({ where: { id: x.a.id }, data: { status: "DECLINED" } }); return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? REC_HINT : m.slice(0, 300) }, { status: 400 }); }
}
