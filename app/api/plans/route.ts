import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb } from "../../../lib/erp";
import { reschedule } from "../../../lib/fypSchedule";
import { UNI_TEMPLATES } from "../../../lib/uniPlanTemplates";
import { withErrors } from "../../../lib/apiHandler";

const day = (v: unknown) => { const d = new Date(String(v || "") + "T00:00:00Z"); return isNaN(d.getTime()) ? null : d; };

// University plans of any office. Creator / owner / Institute Head edit; task owners update their task's status.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { chairmanId } = await erpAccess(user);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "createPlan") {
      const title = String(b.title || "").trim().slice(0, 160);
      if (!title) return NextResponse.json({ error: "Give the plan a name." }, { status: 400 });
      const plan = await edb.uniPlan.create({ data: { chairmanId, title, area: b.area ? String(b.area).slice(0, 80) : null, ownerId: user.id, createdById: user.id } });
      const tpl = UNI_TEMPLATES[String(b.template || "")];
      const start = day(b.startDate) || new Date();
      if (tpl) {
        const ids = tpl.steps.map(() => randomUUID());
        await edb.fypPlanTask.createMany({ data: tpl.steps.map(([t, d, after], i) => ({ id: ids[i], cycleId: plan.id, groupId: null, title: t, category: "GENERAL", startDate: start, endDate: start, durationDays: d, fixedStart: after.length === 0, dependsJson: after.length ? JSON.stringify(after.map((k) => ids[k])) : null, orderIndex: i, createdById: user.id })) });
        await reschedule(chairmanId, plan.id, null);
      }
      return NextResponse.json({ ok: true, id: plan.id });
    }
    const plan = (await edb.uniPlan.findFirst({ where: { id: String(b.cycleId || b.planId || ""), chairmanId } })) as { id: string; ownerId: string | null; createdById: string } | null;
    if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });
    const canEdit = user.role === "CHAIRMAN" || plan.ownerId === user.id || plan.createdById === user.id;
    const task = b.taskId ? ((await edb.fypPlanTask.findFirst({ where: { id: String(b.taskId), cycleId: plan.id } })) as { ownerId: string | null } | null) : null;
    if (!(canEdit || (b.action === "status" && task?.ownerId === user.id))) return NextResponse.json({ error: "Only the plan's owner (or the Institute Head) changes it." }, { status: 403 });
    switch (b.action) {
      case "deletePlan": await edb.fypPlanTask.deleteMany({ where: { cycleId: plan.id } }); await edb.uniPlan.delete({ where: { id: plan.id } }); return NextResponse.json({ ok: true });
      case "add": case "update": {
        const s = day(b.startDate), e = day(b.endDate) || s, title = String(b.title || "").trim().slice(0, 160);
        if (!title || !s || !e || e < s) return NextResponse.json({ error: "Give a title and valid dates." }, { status: 400 });
        const dependsOn = (Array.isArray(b.dependsOn) ? b.dependsOn : []).map(String).filter((x: string) => x && x !== b.taskId).slice(0, 10);
        const data = { title, startDate: s, endDate: e, ownerId: b.ownerId ? String(b.ownerId) : null, ownerText: b.ownerText ? String(b.ownerText).slice(0, 80) : null, durationDays: Number(b.durationDays) > 0 ? Math.round(Number(b.durationDays)) : null, dependsJson: dependsOn.length ? JSON.stringify(dependsOn) : null, fixedStart: !!b.fixedStart };
        if (b.action === "add") await edb.fypPlanTask.create({ data: { ...data, cycleId: plan.id, groupId: null, category: "GENERAL", createdById: user.id } });
        else await edb.fypPlanTask.updateMany({ where: { id: String(b.taskId), cycleId: plan.id }, data });
        break;
      }
      case "delete": await edb.fypPlanTask.deleteMany({ where: { id: String(b.taskId), cycleId: plan.id } }); break;
      case "status": await edb.fypPlanTask.updateMany({ where: { id: String(b.taskId), cycleId: plan.id }, data: { status: ["TODO", "IN_PROGRESS", "DONE"].includes(b.status) ? b.status : "TODO" } }); return NextResponse.json({ ok: true });
      case "reschedule": break;
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    await reschedule(chairmanId, plan.id, null);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Plans are not set up yet — run prisma/migration_erp.sql and migration_fyp_plan.sql." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
