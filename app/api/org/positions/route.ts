import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { ORG_ROLES } from "../../../../lib/orgChart";

export const dynamic = "force-dynamic";
const odb = prisma as unknown as Record<string, any>;

// The Institute Head edits the organisation chart. Giving/removing the actual system role is done by the page through
// the existing role endpoints (give-role, omc-hat, assigner-hat), which keep all their checks; here only the chart is saved.
export async function POST(req: Request) {
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
      if (who) await odb.orgPositionLog.create({ data: { positionId: p.id, title: p.title, userId: who, action: b.action === "assign" ? "ASSIGNED" : "REMOVED", byId: user.id } });
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
