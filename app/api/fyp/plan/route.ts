import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { fypAccess } from "../../../../lib/fyp";
import { addOpenHouseTemplate, addGroupTemplate, addYearTemplate } from "../../../../lib/fypPlan";
import { reschedule } from "../../../../lib/fypSchedule";
import { withErrors } from "../../../../lib/apiHandler";

const pdb = prisma as unknown as Record<string, any>;
const day = (v: unknown) => { const d = new Date(String(v || "") + "T00:00:00Z"); return isNaN(d.getTime()) ? null : d; };

// POST { cycleId, groupId?, action: add | update | delete | status | openHouseTemplate | groupTemplate, ... }
// Year plan (no groupId): the FYP Head / Committee. A group's plan: its supervisor or the FYP Head.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const acc = await fypAccess(user);
  const cycle = await prisma.fypCycle.findFirst({ where: { id: String(b.cycleId || ""), chairmanId: acc.chairmanId } });
  if (!cycle) return NextResponse.json({ error: "cycle not found" }, { status: 404 });
  const groupId = b.groupId ? String(b.groupId) : null;
  const group = groupId ? await prisma.fypGroup.findFirst({ where: { id: groupId, cycleId: cycle.id } }) : null;
  if (groupId && !group) return NextResponse.json({ error: "group not found" }, { status: 404 });
  const manages = acc.manages(cycle.departmentId);
  const ownerOfTask = async () => (b.taskId ? ((await pdb.fypPlanTask.findFirst({ where: { id: String(b.taskId), cycleId: cycle.id } })) as { groupId: string | null; ownerId: string | null } | null) : null);
  const task = await ownerOfTask().catch(() => null);
  const canEdit = manages || (!!group && group.supervisorId === user.id);
  // Owners of a year-plan task may update its status.
  if (!(canEdit || (b.action === "status" && task?.ownerId === user.id))) return NextResponse.json({ error: "Only the FYP Head (or the group's supervisor for its plan) can change this plan." }, { status: 403 });
  try {
    switch (b.action) {
      case "openHouseTemplate": { if (!manages) return NextResponse.json({ error: "forbidden" }, { status: 403 }); const e = await addOpenHouseTemplate(cycle.id, user.id); if (e) return NextResponse.json({ error: e }, { status: 400 }); break; }
      case "yearTemplate": { if (!manages) return NextResponse.json({ error: "forbidden" }, { status: 403 }); await addYearTemplate(cycle.id, user.id); break; }
      case "groupTemplate": { if (!groupId) return NextResponse.json({ error: "choose a group" }, { status: 400 }); const e = await addGroupTemplate(cycle.id, groupId, user.id); if (e) return NextResponse.json({ error: e }, { status: 400 }); break; }
      case "add": case "update": {
        const s = day(b.startDate), e = day(b.endDate) || s;
        const title = String(b.title || "").trim().slice(0, 160);
        if (!title || !s || !e || e < s) return NextResponse.json({ error: "Give a title and valid start / end dates (end on or after start)." }, { status: 400 });
        const durationDays = Number(b.durationDays) > 0 ? Math.min(400, Math.round(Number(b.durationDays))) : null;
        const dependsOn = (Array.isArray(b.dependsOn) ? b.dependsOn : []).map(String).filter((x: string) => x && x !== b.taskId).slice(0, 10);
        const data = { title, startDate: s, endDate: e, ownerId: b.ownerId ? String(b.ownerId) : null, ownerText: b.ownerText ? String(b.ownerText).slice(0, 80) : null, category: groupId ? "GROUP" : b.category === "OPEN_HOUSE" ? "OPEN_HOUSE" : "GENERAL", durationDays, dependsJson: dependsOn.length ? JSON.stringify(dependsOn) : null, fixedStart: !!b.fixedStart };
        if (b.action === "add") await pdb.fypPlanTask.create({ data: { ...data, cycleId: cycle.id, groupId, createdById: user.id } });
        else await pdb.fypPlanTask.updateMany({ where: { id: String(b.taskId), cycleId: cycle.id, groupId }, data });
        break;
      }
      case "delete": await pdb.fypPlanTask.deleteMany({ where: { id: String(b.taskId), cycleId: cycle.id, groupId } }); break;
      case "reschedule": break;
      case "status": await pdb.fypPlanTask.updateMany({ where: { id: String(b.taskId), cycleId: cycle.id }, data: { status: ["TODO", "IN_PROGRESS", "DONE"].includes(b.status) ? b.status : "TODO" } }); break;
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    // Dates follow durations, dependencies, weekends and holidays after every change.
    if (b.action !== "status") await reschedule(acc.chairmanId, cycle.id, groupId);
  } catch { return NextResponse.json({ error: "FYP plans are not set up yet — run prisma/migration_fyp_plan.sql." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
