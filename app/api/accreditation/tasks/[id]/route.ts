import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { writeAuditLog } from "../../../../../lib/audit";
import { notifyUsers } from "../../../../../lib/notifications";
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "../../../../../lib/evidenceFiles";
import { accessWindow, assignablePeople, canWorkOn, def as taskDefOf, govScope, inScope, parseData } from "../../../../../lib/accreditation/governance";
import { SourceLoader } from "../../../../../lib/accreditation/sources";
import type { BodyKey } from "../../../../../lib/accreditation/bodies";
import { approverFor } from "../../../../../lib/approvers";
import { withErrors } from "../../../../../lib/apiHandler";

const MISSING = "Accreditation governance needs prisma/migration_accreditation_governance.sql to be run in Supabase first.";
const dateOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
const href = (id: string) => `/accreditation/tasks/${id}`;

async function load(id: string) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const t = await prisma.accreditationTask.findUnique({ where: { id } });
  if (!t) return { user, t: null as null };
  const cycle = await prisma.accreditationCycle.findUnique({ where: { id: t.cycleId } });
  if (!cycle) return { user, t: null as null };
  const s = await govScope(user);
  // Managers in scope, plus whoever acts for or covers the department's Chairman/HoD (lib/approvers.ts).
  const covering = (await approverFor(cycle.chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: cycle.departmentId })).ids;
  const managing = (!!s?.canManage && inScope(s, cycle)) || covering.includes(user.id);
  const viewing = managing || (!!s && inScope(s, cycle)) || t.assigneeId === user.id;
  const d = taskDefOf(cycle.body, t.code);
  return { user, t, cycle, s, managing, viewing, d, covering };
}
const event = (taskId: string, action: string, byId: string, toId?: string | null, note?: string | null) =>
  prisma.accreditationTask.update({ where: { id: taskId }, data: { updatedAt: new Date() } }).then(() => prisma.accreditationTaskEvent.create({ data: { taskId, action, byId, toId: toId || null, note: note || null } }));

// GET ?file=<id> — an evidence file attached to the task.
async function GET_handler(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const x = await load(params.id);
    if (!x?.t || !x.viewing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const f = await prisma.accreditationTaskFile.findFirst({ where: { id: req.nextUrl.searchParams.get("file") || "", taskId: x.t.id } });
    if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(Buffer.from(f.data, "base64"), { headers: { "Content-Type": f.mimeType, "Content-Disposition": `attachment; filename="${f.fileName.replace(/["\r\n]/g, "")}"` } });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// PATCH { action, ... } — assign | revoke | save | verifyProfile | uploadFile | deleteFile | submit | approve | return | reopen
async function PATCH_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  try {
    const x = await load(params.id);
    if (!x) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    if (!x.t || !x.viewing || !x.d) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { user, t, cycle, s, managing, d, covering } = x;
    const working = canWorkOn(user.id, t, cycle);
    const now = new Date();
    const notManager = () => NextResponse.json({ error: "Only the Institute Head, the Dean or the Chairman can do this." }, { status: 403 });

    switch (b.action) {
      case "assign": {
        if (!managing || !s) return notManager();
        if (cycle.status !== "OPEN") return NextResponse.json({ error: "This visit is closed." }, { status: 400 });
        if (t.status === "APPROVED") return NextResponse.json({ error: "This task is approved. Reopen it before giving it to someone else." }, { status: 400 });
        const person = (await assignablePeople(s)).find((p) => p.id === b.assigneeId);
        if (!person) return NextResponse.json({ error: "Choose a Program Lead, teacher or staff member in your area." }, { status: 400 });
        const due = dateOf(b.dueDate);
        const until = dateOf(b.accessUntil) || accessWindow(due, cycle.visitDate);
        if (until < now) return NextResponse.json({ error: "The access can't end in the past." }, { status: 400 });
        const before = t.assigneeId;
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { assigneeId: person.id, assignedById: user.id, assignedAt: now, dueDate: due, accessUntil: until, status: "ASSIGNED" } });
        await event(t.id, before && before !== person.id ? "REASSIGNED" : "ASSIGNED", user.id, person.id, b.note ? String(b.note).slice(0, 300) : null);
        await notifyUsers([person.id], { kind: "ACCREDITATION", title: `Accreditation task for you: ${d.code} ${d.title}`, body: `${cycle.title}${due ? ` — due ${due.toISOString().slice(0, 10)}` : ""}. The data the system holds is filled in; check it, add what is missing and sign off.`, href: href(t.id) });
        if (before && before !== person.id) await notifyUsers([before], { kind: "ACCREDITATION", title: `Accreditation task reassigned: ${d.code} ${d.title}`, body: `It is now with ${person.name}.`, href: "/accreditation/tasks" });
        await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_TASK_ASSIGNED", entityType: "AccreditationTask", entityId: t.id, metadata: { to: person.id, before } });
        return NextResponse.json({ ok: true });
      }
      case "revoke": {
        if (!managing) return notManager();
        if (!t.assigneeId) return NextResponse.json({ error: "Nobody holds this task." }, { status: 400 });
        if (t.status === "APPROVED") return NextResponse.json({ error: "This task is approved. Reopen it first." }, { status: 400 });
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { assigneeId: null, accessUntil: null, status: "OPEN" } });
        await event(t.id, "REVOKED", user.id, t.assigneeId, b.note ? String(b.note).slice(0, 300) : null);
        await notifyUsers([t.assigneeId], { kind: "ACCREDITATION", title: `Accreditation task withdrawn: ${d.code} ${d.title}`, body: "You no longer have access to it.", href: "/accreditation/tasks" });
        await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_TASK_REVOKED", entityType: "AccreditationTask", entityId: t.id, metadata: { from: t.assigneeId } });
        return NextResponse.json({ ok: true });
      }
      case "save": {
        if (!working && !managing) return NextResponse.json({ error: t.assigneeId === user.id ? "Your access to this task has ended." : "This task isn't assigned to you." }, { status: 403 });
        if (t.status === "APPROVED" && !managing) return NextResponse.json({ error: "This task is approved." }, { status: 400 });
        const cur = parseData(t);
        const checked: Record<string, boolean> = {};
        for (const c of d.checklist) checked[c] = !!b.checked?.[c];
        const fields: Record<string, string> = {};
        for (const f of d.fields || []) fields[f.key] = String(b.fields?.[f.key] ?? cur.fields?.[f.key] ?? "").slice(0, 5000);
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { dataJson: JSON.stringify({ ...cur, checked, fields }) } });
        if (!working) await event(t.id, "OVERRIDDEN", user.id, null, "Edited the task's checklist and notes");
        return NextResponse.json({ ok: true });
      }
      case "verifyProfile": {
        if (!(working || managing) || !d.sources.includes("faculty")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const loader = new SourceLoader({ chairmanId: cycle.chairmanId, leadId: cycle.leadId, program: cycle.program, departmentId: cycle.departmentId, body: cycle.body as BodyKey });
        const teacher = (await loader.faculty()).find((f) => f.id === b.userId);
        if (!teacher) return NextResponse.json({ error: "That teacher isn't on this program's faculty." }, { status: 400 });
        const on = b.verified !== false;
        await prisma.facultyProfile.upsert({
          where: { userId: teacher.id },
          create: { userId: teacher.id, verifiedAt: on ? now : null, verifiedById: on ? user.id : null, verifiedNote: on ? String(b.note || "").slice(0, 300) || null : null },
          update: { verifiedAt: on ? now : null, verifiedById: on ? user.id : null, verifiedNote: on ? String(b.note || "").slice(0, 300) || null : null },
        });
        await writeAuditLog({ actorUserId: user.id, action: on ? "FACULTY_PROFILE_VERIFIED" : "FACULTY_PROFILE_UNVERIFIED", entityType: "FacultyProfile", entityId: teacher.id, metadata: { taskId: t.id } });
        return NextResponse.json({ ok: true });
      }
      case "uploadFile": {
        if (!working && !managing) return NextResponse.json({ error: "This task isn't open to you." }, { status: 403 });
        const name = String(b.file?.name || "").slice(0, 200), type = String(b.file?.type || ""), data = typeof b.file?.data === "string" ? b.file.data : "";
        if (!name || !ALLOWED_TYPES.includes(type)) return NextResponse.json({ error: "Attach a PDF, Word, Excel, PowerPoint, image or text file." }, { status: 400 });
        const size = Math.floor((data.length * 3) / 4);
        if (size > MAX_FILE_BYTES) return NextResponse.json({ error: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.` }, { status: 400 });
        if ((await prisma.accreditationTaskFile.count({ where: { taskId: t.id } })) >= 25) return NextResponse.json({ error: "A task holds at most 25 files." }, { status: 400 });
        const f = await prisma.accreditationTaskFile.create({ data: { taskId: t.id, title: String(b.title || name).slice(0, 200), fileName: name, mimeType: type, size, data, uploadedById: user.id } });
        await event(t.id, "FILE_ADDED", user.id, null, name);
        return NextResponse.json({ ok: true, id: f.id });
      }
      case "deleteFile": {
        const f = await prisma.accreditationTaskFile.findFirst({ where: { id: String(b.fileId || ""), taskId: t.id } });
        if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
        if (!managing && !(working && f.uploadedById === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await prisma.accreditationTaskFile.delete({ where: { id: f.id } });
        await event(t.id, "FILE_REMOVED", user.id, null, f.fileName);
        return NextResponse.json({ ok: true });
      }
      case "submit": {
        if (!working) return NextResponse.json({ error: t.assigneeId === user.id ? "Your access to this task has ended." : "This task isn't assigned to you." }, { status: 403 });
        const dd = parseData(t);
        if (d.checklist.some((c) => !dd.checked?.[c])) return NextResponse.json({ error: "Tick every point of the checklist first (explain in the notes what isn't so)." }, { status: 400 });
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { status: "SUBMITTED", submittedAt: now, submittedById: user.id } });
        await event(t.id, "SUBMITTED", user.id);
        await notifyUsers([t.assignedById, ...covering], { kind: "ACCREDITATION", title: `Accreditation task signed off: ${d.code} ${d.title}`, body: `${user.name} has verified it for ${cycle.title}.`, href: href(t.id), exceptId: user.id });
        return NextResponse.json({ ok: true });
      }
      case "approve": {
        if (!managing) return notManager();
        const override = t.status !== "SUBMITTED";
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { status: "APPROVED", reviewedAt: now, reviewedById: user.id, reviewNote: b.note ? String(b.note).slice(0, 1000) : null } });
        await event(t.id, override ? "OVERRIDDEN" : "APPROVED", user.id, null, override ? "Approved without the assignee's sign-off" : b.note || null);
        await notifyUsers([t.assigneeId], { kind: "ACCREDITATION", title: `Accreditation task approved: ${d.code} ${d.title}`, href: href(t.id), exceptId: user.id });
        return NextResponse.json({ ok: true });
      }
      case "return": {
        if (!managing) return notManager();
        if (t.status !== "SUBMITTED") return NextResponse.json({ error: "Only signed-off work can be returned." }, { status: 400 });
        const note = String(b.note || "").trim().slice(0, 1000);
        if (note.length < 3) return NextResponse.json({ error: "Say what needs to change." }, { status: 400 });
        const until = t.accessUntil && t.accessUntil > now ? t.accessUntil : new Date(now.getTime() + 7 * 864e5);
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { status: "RETURNED", reviewedAt: now, reviewedById: user.id, reviewNote: note, accessUntil: until } });
        await event(t.id, "RETURNED", user.id, t.assigneeId, note);
        await notifyUsers([t.assigneeId], { kind: "ACCREDITATION", title: `Accreditation task returned: ${d.code} ${d.title}`, body: note, href: href(t.id) });
        return NextResponse.json({ ok: true });
      }
      case "reopen": {
        if (!managing) return notManager();
        if (t.status !== "APPROVED") return NextResponse.json({ error: "Only an approved task can be reopened." }, { status: 400 });
        const until = new Date(now.getTime() + 7 * 864e5);
        await prisma.accreditationTask.update({ where: { id: t.id }, data: { status: t.assigneeId ? "ASSIGNED" : "OPEN", accessUntil: t.assigneeId ? until : null, reviewedAt: null } });
        await event(t.id, "REOPENED", user.id);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    console.error("accreditation task", (e as Error).message);
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
export const GET = withErrors(GET_handler);
export const PATCH = withErrors(PATCH_handler);
