import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { ORG_ROLES, GROUP_ROLES } from "../../../../lib/orgChart";
import { notifyUsers } from "../../../../lib/notifications";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const odb = prisma as unknown as Record<string, any>;

// The Institute Head edits the organisation chart. Giving/removing the actual system role is done by the page through
// the existing role endpoints (give-role, omc-hat, assigner-hat), which keep all their checks; here only the chart is saved.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head edits the organisation chart." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = user.id;
  const mine = async (id: string) => (id ? await odb.orgPosition.findFirst({ where: { id, chairmanId } }) : null);
  const clean = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 120) : null);
  try {
    if (b.action === "create" || b.action === "update") {
      const role = ORG_ROLES.some((r) => r.value === b.role) ? b.role : "NONE";
      const data = { title: clean(b.title) || "Position", role, parentId: clean(b.parentId), facultyId: clean(b.facultyId), departmentId: clean(b.departmentId), program: clean(b.program) };
      if (data.parentId && !(await mine(data.parentId))) return NextResponse.json({ error: "parent not found" }, { status: 400 });
      if (b.action === "create") { const p = await odb.orgPosition.create({ data: { ...data, chairmanId, orderIndex: Number(b.orderIndex) || 0 } }); return NextResponse.json({ ok: true, id: p.id }); }
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (data.parentId === p.id) return NextResponse.json({ error: "a position cannot be under itself" }, { status: 400 });
      await odb.orgPosition.update({ where: { id: p.id }, data });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (p.holderId) return NextResponse.json({ error: "Remove the person from this position first." }, { status: 409 });
      if (await odb.orgPosition.count({ where: { parentId: p.id } })) return NextResponse.json({ error: "Move or delete the positions under it first." }, { status: 409 });
      await odb.orgPosition.delete({ where: { id: p.id } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "assign" || b.action === "unassign") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      const holderId = b.action === "assign" ? String(b.userId || "") : null;
      await odb.orgPosition.update({ where: { id: p.id }, data: { holderId } });
      const who = b.action === "assign" ? holderId : p.holderId;
      const reason = clean(b.reason);
      if (who) await odb.orgPositionLog.create({ data: { positionId: p.id, title: p.title, userId: who, action: b.action === "assign" ? "ASSIGNED" : "REMOVED", byId: user.id, ...(reason ? { reason } : {}) } }).catch(() => odb.orgPositionLog.create({ data: { positionId: p.id, title: p.title, userId: who, action: b.action === "assign" ? "ASSIGNED" : "REMOVED", byId: user.id } }));
      if (who) await notifyUsers([who], { kind: "ROLE", title: b.action === "assign" ? `You now hold: ${p.title}` : `You no longer hold: ${p.title}`, body: reason || undefined, href: "/dashboard" });
      await writeAuditLog({ actorUserId: user.id, action: b.action === "assign" ? "ORG_POSITION_ASSIGNED" : "ORG_POSITION_VACATED", entityType: "OrgPosition", entityId: p.id, metadata: { title: p.title, userId: who || "" } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "cover") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      let covers: string[] = []; try { covers = JSON.parse(p.coversJson); } catch { covers = []; }
      covers = b.on ? Array.from(new Set([...covers, String(b.role)])) : covers.filter((r) => r !== b.role);
      await odb.orgPosition.update({ where: { id: p.id }, data: { coversJson: JSON.stringify(covers), ...(b.on && b.departmentId && !p.departmentId ? { departmentId: b.departmentId } : {}), ...(b.on && b.program && !p.program ? { program: b.program } : {}) } });
      return NextResponse.json({ ok: true });
    }
    // Move a position (with its branch) under another; with preview: true only reports what would change.
    if (b.action === "move") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      const to = b.parentId ? await mine(String(b.parentId)) : null;
      if (b.parentId && !to) return NextResponse.json({ error: "Position to move under not found." }, { status: 404 });
      const all = (await odb.orgPosition.findMany({ where: { chairmanId } })) as MovePos[];
      if (to && branchOf(all, p.id).has(to.id)) return NextResponse.json({ error: "A position can't be moved under its own branch." }, { status: 400 });
      const effects = await moveEffects(chairmanId, all, p, to);
      if (b.preview) return NextResponse.json({ ok: true, effects });
      await odb.orgPosition.update({ where: { id: p.id }, data: { parentId: to?.id || null } });
      await applyEffects(effects, false);
      await odb.orgMove.create({ data: { id: randomUUID(), chairmanId, positionId: p.id, fromParentId: p.parentId, toParentId: to?.id || null, effectsJson: JSON.stringify(effects), byId: user.id } });
      await writeAuditLog({ actorUserId: user.id, action: "ORG_POSITION_MOVED", entityType: "OrgPosition", entityId: p.id, metadata: { title: p.title, from: p.parentId || "", to: to?.id || "", effects: effects.map((e) => e.text).join(" | ").slice(0, 900) } }).catch(() => null);
      const moved = effects.flatMap((e) => e.notify || []);
      if (moved.length) await notifyUsers(moved, { kind: "ROLE", title: `Organisation chart: ${p.title} now reports to ${to?.title || "the top level"}`, body: effects.map((e) => e.text).join(" "), href: "/dashboard" });
      return NextResponse.json({ ok: true, effects });
    }
    if (b.action === "undo") {
      const m = (await odb.orgMove.findFirst({ where: { chairmanId, undoneAt: null, ...(b.moveId ? { id: String(b.moveId) } : {}) }, orderBy: { at: "desc" } })) as { id: string; positionId: string; fromParentId: string | null; effectsJson: string } | null;
      if (!m) return NextResponse.json({ error: "Nothing to undo." }, { status: 404 });
      await odb.orgPosition.updateMany({ where: { id: m.positionId, chairmanId }, data: { parentId: m.fromParentId } });
      let effects: Effect[] = []; try { effects = JSON.parse(m.effectsJson); } catch { effects = []; }
      await applyEffects(effects, true);
      await odb.orgMove.update({ where: { id: m.id }, data: { undoneAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "ORG_POSITION_MOVE_UNDONE", entityType: "OrgPosition", entityId: m.positionId, metadata: { moveId: m.id } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    // Someone acting in a position for a period (the holder on leave).
    if (b.action === "acting") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      const from = new Date(String(b.fromDate || "")), to = new Date(String(b.toDate || ""));
      if (isNaN(+from) || isNaN(+to) || to < from) return NextResponse.json({ error: "Give a start and an end date (end on or after start)." }, { status: 400 });
      const who = await prisma.user.findFirst({ where: { id: String(b.userId || ""), isActive: true, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, name: true } });
      if (!who) return NextResponse.json({ error: "Choose someone of this institute." }, { status: 400 });
      await odb.orgActing.create({ data: { id: randomUUID(), chairmanId, positionId: p.id, userId: who.id, fromDate: from, toDate: new Date(to.getTime() + 86399000), reason: clean(b.reason), byId: user.id } });
      await odb.orgPositionLog.create({ data: { positionId: p.id, title: p.title, userId: who.id, action: "ACTING", byId: user.id, ...(clean(b.reason) ? { reason: clean(b.reason) } : {}) } }).catch(() => null);
      await writeAuditLog({ actorUserId: user.id, action: "ORG_ACTING_SET", entityType: "OrgPosition", entityId: p.id, metadata: { title: p.title, userId: who.id, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } }).catch(() => null);
      await notifyUsers([who.id], { kind: "ROLE", title: `You are acting ${p.title}`, body: `From ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}${clean(b.reason) ? ` — ${clean(b.reason)}` : ""}. Its approvals and notifications come to you until then.`, href: "/dashboard" });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "endActing") {
      const a = await odb.orgActing.findFirst({ where: { id: String(b.actingId || ""), chairmanId } });
      if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
      await odb.orgActing.update({ where: { id: a.id }, data: { endedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "ORG_ACTING_ENDED", entityType: "OrgPosition", entityId: a.positionId, metadata: { userId: a.userId } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    // Switch a position off (the institute does not have it) or on again.
    // Committee members listed under a convener's box. OMC members get the OMC hat (the OMC pages, scoped to their
    // department); QEC members get the QEC_MEMBER hat (read access to the quality pages).
    if (b.action === "addMember" || b.action === "removeMember") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (!GROUP_ROLES.includes(p.role)) return NextResponse.json({ error: "Only a convener's position lists members." }, { status: 400 });
      const u = await prisma.user.findFirst({ where: { id: String(b.userId || ""), OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, name: true, role: true, extraRoles: true, departmentId: true } });
      if (!u) return NextResponse.json({ error: "Choose someone of this institute." }, { status: 400 });
      const omc = p.role === "OMC_CONVENER";
      if (b.action === "addMember") {
        if (omc && p.departmentId && u.departmentId && u.departmentId !== p.departmentId) return NextResponse.json({ error: `${u.name} belongs to another department; an OMC member reviews only their own department's courses.` }, { status: 400 });
        await odb.orgMember.upsert({ where: { positionId_userId: { positionId: p.id, userId: u.id } }, create: { id: randomUUID(), positionId: p.id, userId: u.id, addedById: user.id, addedAt: new Date() }, update: {} });
        if (omc) { if (u.role !== "OMC") await prisma.user.update({ where: { id: u.id }, data: { omcHat: true, ...(p.departmentId && !u.departmentId ? { departmentId: p.departmentId } : {}) } as never }); }
        else await prisma.user.update({ where: { id: u.id }, data: { extraRoles: Array.from(new Set([...(u.extraRoles || []), "QEC_MEMBER"])) } });
        await notifyUsers([u.id], { kind: "ROLE", title: `You are a member of: ${p.title}`, href: omc ? "/omc/queue" : "/evaluations" });
      } else {
        await odb.orgMember.deleteMany({ where: { positionId: p.id, userId: u.id } });
        const still = await odb.orgMember.count({ where: { userId: u.id, positionId: { in: (await odb.orgPosition.findMany({ where: { chairmanId, role: p.role }, select: { id: true } })).map((x: { id: string }) => x.id) } } });
        if (!still) {
          if (omc && u.role !== "OMC" && !(u.extraRoles || []).includes("OMC_CONVENER")) await prisma.user.update({ where: { id: u.id }, data: { omcHat: false } as never });
          if (!omc) await prisma.user.update({ where: { id: u.id }, data: { extraRoles: (u.extraRoles || []).filter((x) => x !== "QEC_MEMBER") } });
        }
      }
      await writeAuditLog({ actorUserId: user.id, action: b.action === "addMember" ? "ORG_MEMBER_ADDED" : "ORG_MEMBER_REMOVED", entityType: "OrgPosition", entityId: p.id, metadata: { title: p.title, userId: u.id } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    // Add the conveners the chart is missing: an OMC Convener per department (under the department's Dean, else the
    // Institute Head) with that department's current OMC members, and a QEC Convener under the Institute Head.
    if (b.action === "conveners") {
      const all = await odb.orgPosition.findMany({ where: { chairmanId } });
      const root = all.find((x: { parentId: string | null }) => !x.parentId);
      if (!root) return NextResponse.json({ error: "Build the chart first." }, { status: 409 });
      const depts = await prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, facultyId: true } });
      let made = 0;
      for (const d of depts) {
        if (all.some((x: { role: string; departmentId: string | null }) => x.role === "OMC_CONVENER" && x.departmentId === d.id)) continue;
        const dean = all.find((x: { role: string; facultyId: string | null }) => x.role === "DEAN" && d.facultyId && x.facultyId === d.facultyId);
        const id = randomUUID();
        const conv = await prisma.user.findFirst({ where: { extraRoles: { has: "OMC_CONVENER" }, departmentId: d.id, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true } });
        await odb.orgPosition.create({ data: { id, chairmanId, title: `OMC Convener, ${d.name}`, role: "OMC_CONVENER", departmentId: d.id, parentId: (dean || root).id, holderId: conv?.id || null, orderIndex: 900 + made } });
        const members = await prisma.user.findMany({ where: { departmentId: d.id, isActive: true, OR: [{ role: "OMC" }, { omcHat: true }], AND: [{ OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }] } as never, select: { id: true } });
        for (const m of members) if (m.id !== conv?.id) await odb.orgMember.create({ data: { id: randomUUID(), positionId: id, userId: m.id, addedById: user.id, addedAt: new Date() } }).catch(() => null);
        made++;
      }
      if (!all.some((x: { role: string }) => x.role === "QEC_INCHARGE")) {
        const q = await prisma.user.findFirst({ where: { extraRoles: { has: "QEC_INCHARGE" }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true } });
        await odb.orgPosition.create({ data: { id: randomUUID(), chairmanId, title: "QEC Convener", role: "QEC_INCHARGE", parentId: root.id, holderId: q?.id || null, orderIndex: 990 } });
        made++;
      }
      return NextResponse.json({ ok: true, made });
    }
    if (b.action === "off") {
      const p = await mine(String(b.id)); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      await odb.orgPosition.update({ where: { id: p.id }, data: { offAt: b.on ? null : new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: b.on ? "ORG_POSITION_ON" : "ORG_POSITION_OFF", entityType: "OrgPosition", entityId: p.id, metadata: { title: p.title } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "seed") {
      if (await odb.orgPosition.count({ where: { chairmanId } })) return NextResponse.json({ error: "The chart already has positions." }, { status: 409 });
      const people = await prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, role: true, secondaryRole: true, tertiaryRole: true, facultyId: true, departmentId: true, leadProgram: true, omcHat: true, assignerTerm: true } as never }) as unknown as { id: string; role: string; secondaryRole: string | null; tertiaryRole: string | null; facultyId: string | null; departmentId: string | null; leadProgram: string | null; omcHat: boolean; assignerTerm: string | null }[];
      const has = (u: (typeof people)[number], r: string) => [u.role, u.secondaryRole, u.tertiaryRole].includes(r);
      const [faculties, departments, programs] = await Promise.all([
        prisma.faculty.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
        prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, facultyId: true }, orderBy: { name: "asc" } }),
        prisma.degreeProgram.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { name: true, coordinatorId: true, coordinator: { select: { departmentId: true } } } }),
      ]);
      const rows: Record<string, unknown>[] = [];
      const add = (r: Record<string, unknown>) => { const id = randomUUID(); rows.push({ id, chairmanId, orderIndex: rows.length, ...r }); return id; };
      const root = add({ title: "Institute Head", role: "NONE", holderId: chairmanId });
      const deanPos = new Map<string, string>();
      for (const f of faculties) deanPos.set(f.id, add({ title: `Dean, ${f.name}`, role: "DEAN", facultyId: f.id, parentId: root, holderId: people.find((u) => has(u, "DEAN") && u.facultyId === f.id)?.id || null }));
      for (const d of departments) {
        const hodId = add({ title: `Chairman, ${d.name}`, role: "HEAD_OF_DEPARTMENT", departmentId: d.id, parentId: (d.facultyId && deanPos.get(d.facultyId)) || root, holderId: people.find((u) => has(u, "HEAD_OF_DEPARTMENT") && u.departmentId === d.id)?.id || null });
        const seen = new Set<string>();
        for (const p of programs.filter((x) => x.coordinator.departmentId === d.id)) {
          if (seen.has(p.name)) continue; seen.add(p.name);
          const lead = people.find((u) => u.leadProgram === p.name) || people.find((u) => u.id === p.coordinatorId);
          add({ title: `Program Lead, ${p.name}`, role: "PROGRAM_LEAD", departmentId: d.id, program: p.name, parentId: hodId, holderId: lead?.id || null });
        }
      }
      for (const u of people.filter((x) => has(x, "OMC") || x.omcHat)) add({ title: "OMC Member", role: "OMC", parentId: root, holderId: u.id });
      for (const u of people.filter((x) => has(x, "COURSE_ASSIGNER") || x.assignerTerm)) add({ title: "Course Assigner", role: "COURSE_ASSIGNER", parentId: root, holderId: u.id });
      await odb.orgPosition.createMany({ data: rows });
      return NextResponse.json({ ok: true, made: rows.length });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: /does not exist|relation/i.test(msg) ? "The organisation chart is not set up yet — run prisma/migration_org_chart.sql in Supabase." : msg.slice(0, 200) }, { status: 500 });
  }
}

// ------------------------------------------------------------------ moving a branch
type MovePos = { id: string; parentId: string | null; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null };
type Effect = { kind: "deptFaculty" | "programDept" | "reports"; text: string; departmentId?: string; program?: string; positionId?: string; from?: string | null; to?: string | null; leadId?: string | null; notify?: string[] };

function branchOf(all: MovePos[], id: string) {
  const out = new Set<string>([id]);
  for (let grew = true; grew;) { grew = false; for (const p of all) if (p.parentId && out.has(p.parentId) && !out.has(p.id)) { out.add(p.id); grew = true; } }
  return out;
}
/** The nearest position at or above `from` carrying this role. */
function nearest(all: MovePos[], from: MovePos | null, role: string) {
  for (let x = from, i = 0; x && i < 20; i++) { if (x.role === role) return x; x = x.parentId ? all.find((y) => y.id === x!.parentId) || null : null; }
  return null;
}
/** What a move changes: who the moved position now reports to, and — for a department or a program — which faculty /
 * department it belongs to (so its approvals go to the new Dean / Chairman). */
async function moveEffects(chairmanId: string, all: MovePos[], p: MovePos, to: MovePos | null): Promise<Effect[]> {
  const name = async (id: string | null | undefined) => (id ? (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name || "—" : "nobody yet");
  const oldParent = p.parentId ? all.find((x) => x.id === p.parentId) || null : null;
  const effects: Effect[] = [{ kind: "reports", text: `${p.title}${p.holderId ? ` (${await name(p.holderId)})` : ""} will report to ${to ? `${to.title} (${await name(to.holderId)})` : "the top level"} instead of ${oldParent ? oldParent.title : "the top level"}.`, notify: p.holderId ? [p.holderId] : [] }];
  if (p.role === "HEAD_OF_DEPARTMENT" && p.departmentId) {
    const dean = nearest(all, to, "DEAN");
    const dep = await prisma.department.findFirst({ where: { id: p.departmentId, chairmanId }, select: { id: true, name: true, facultyId: true } });
    const newFac = dean?.facultyId || null;
    if (dep && dep.facultyId !== newFac) {
      const fac = newFac ? await prisma.faculty.findUnique({ where: { id: newFac }, select: { name: true } }) : null;
      effects.push({ kind: "deptFaculty", departmentId: dep.id, from: dep.facultyId, to: newFac, text: `Department ${dep.name} moves ${fac ? `to the faculty ${fac.name}` : "out of its faculty (it reports to the Institute Head directly)"}: its leave, results and other Dean approvals go to ${dean ? `${dean.title} (${await name(dean.holderId)})` : "the Institute Head"}.`, notify: dean?.holderId ? [dean.holderId] : [] });
    }
  }
  if (p.role === "PROGRAM_LEAD" && p.program) {
    const hod = nearest(all, to, "HEAD_OF_DEPARTMENT");
    const dp = await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: p.program }, select: { departmentId: true } });
    const newDept = hod?.departmentId || null;
    if (newDept && dp && dp.departmentId !== newDept) {
      const dep = await prisma.department.findUnique({ where: { id: newDept }, select: { name: true } });
      effects.push({ kind: "programDept", program: p.program, positionId: p.id, from: dp.departmentId, to: newDept, leadId: p.holderId, text: `Program ${p.program} moves to the department ${dep?.name}: its Chairman approvals go to ${hod?.title} (${await name(hod?.holderId)}).`, notify: hod?.holderId ? [hod.holderId] : [] });
    }
  }
  return effects;
}
async function applyEffects(effects: Effect[], undo: boolean) {
  for (const e of effects) {
    const v = undo ? e.from ?? null : e.to ?? null;
    if (e.kind === "deptFaculty" && e.departmentId) await prisma.department.update({ where: { id: e.departmentId }, data: { facultyId: v } });
    if (e.kind === "programDept" && e.program && v) {
      await prisma.departmentProgram.updateMany({ where: { degreeProgram: e.program, departmentId: undo ? e.to! : e.from! }, data: { departmentId: v } });
      if (e.leadId) await prisma.user.update({ where: { id: e.leadId }, data: { departmentId: v } });
      if (e.positionId) await odb.orgPosition.update({ where: { id: e.positionId }, data: { departmentId: v } });
    }
  }
}
export const POST = withErrors(POST_handler);
