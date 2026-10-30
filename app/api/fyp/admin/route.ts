import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import {
  autoAssignPanels, consolidate, DEFAULT_CUTOFFS, DEFAULT_MILESTONES, DEFAULT_RUBRIC, departmentsOf, fypAccess, grantExtension, MILESTONE_KINDS, newExternalToken, REQUISITION_KINDS, signOff,
} from "../../../../lib/fyp";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 60;
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// FYP administration: the department Chairman names the FYP Head and Committee and signs off results; the Head and
// Committee run the cycle (settings, milestones, rubric, proposal review, panels, consolidation, extensions, requisitions).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const acc = await fypAccess(user);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  const audit = (entityType: string, entityId: string, metadata: Record<string, string | number | boolean> = {}) => writeAuditLog({ actorUserId: user.id, action: `FYP_${action.toUpperCase()}`, entityType, entityId, metadata });

  // Cycle-scoped actions: find the cycle and check the person runs FYPs in its department.
  const cycleId = str(b.cycleId, 60);
  const cycle = cycleId ? await prisma.fypCycle.findFirst({ where: { id: cycleId, chairmanId: acc.chairmanId } }) : null;
  const managesCycle = !!cycle && acc.manages(cycle.departmentId);

  try {
    switch (action) {
      // ---- Department Chairman: FYP Head and Committee
      case "assignStaff": {
        const departmentId = str(b.departmentId, 60);
        if (!acc.chairs(departmentId)) return bad("Only the department's Chairman (or the Institute Head) names the FYP Head.", 403);
        const dept = await prisma.department.findFirst({ where: { id: departmentId, chairmanId: acc.chairmanId } });
        const person = await prisma.user.findUnique({ where: { id: str(b.userId, 60) }, select: { id: true, name: true, isActive: true, managedById: true, managedBy: { select: { managedById: true } } } });
        if (!dept || !person || !person.isActive || (person.managedById !== acc.chairmanId && person.managedBy?.managedById !== acc.chairmanId)) return bad("Choose a faculty member of your institute.");
        const role = b.role === "HEAD" ? "HEAD" : "COMMITTEE";
        if (role === "HEAD") await prisma.fypStaff.updateMany({ where: { departmentId, role: "HEAD", userId: { not: person.id } }, data: { role: "COMMITTEE" } });
        const row = await prisma.fypStaff.upsert({ where: { departmentId_userId: { departmentId, userId: person.id } }, create: { chairmanId: acc.chairmanId, departmentId, userId: person.id, role, assignedById: user.id }, update: { role, assignedById: user.id } });
        await notifyUsers([person.id], { kind: "FYP", title: role === "HEAD" ? `You are the FYP Head of ${dept.name}` : `You are on the FYP Committee of ${dept.name}`, body: "Open Final Year Projects to manage proposals, groups, panels and results.", href: "/fyp/manage", exceptId: user.id });
        await audit("FypStaff", row.id, { role, userId: person.id });
        return NextResponse.json({ staff: row });
      }
      case "removeStaff": {
        const row = await prisma.fypStaff.findFirst({ where: { id: str(b.id, 60), chairmanId: acc.chairmanId } });
        if (!row || !acc.chairs(row.departmentId)) return bad("forbidden", 403);
        await prisma.fypStaff.delete({ where: { id: row.id } });
        await audit("FypStaff", row.id);
        return NextResponse.json({ ok: true });
      }

      // ---- Cycle setup
      case "createCycle": {
        const departmentId = str(b.departmentId, 60);
        if (!acc.manages(departmentId)) return bad("Only the FYP Head or Committee of this department opens a cycle.", 403);
        const title = str(b.title, 120), termName = b.termName === "Spring" ? "Spring" : "Fall", termYear = Math.round(num(b.termYear, new Date().getFullYear()));
        if (!title) return bad("Name the cycle, e.g. FYP 2025-26.");
        const start = new Date();
        const c = await prisma.fypCycle.create({ data: { chairmanId: acc.chairmanId, departmentId, title, termName, termYear, cutoffsJson: JSON.stringify(DEFAULT_CUTOFFS), createdById: user.id } });
        await prisma.fypMilestone.createMany({ data: DEFAULT_MILESTONES.map((m, i) => ({ cycleId: c.id, kind: m.kind, title: m.title, weightPct: m.weightPct, orderIndex: i, dueDate: new Date(start.getTime() + m.days * 86400000) })) });
        await prisma.fypRubricCriterion.createMany({ data: DEFAULT_RUBRIC.map((r, i) => ({ cycleId: c.id, ...r, maxScore: 10, orderIndex: i })) });
        await audit("FypCycle", c.id, { title });
        return NextResponse.json({ cycle: c });
      }
      case "cycleExtra": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const { saveCycleExtra, FYP_EXTRA_HINT } = await import("../../../../lib/fypScaling");
        const x = { coSupervisorPct: Math.max(0, Math.min(50, num(b.coSupervisorPct, 0))), scaling: (["NONE", "ZSCORE", "SHIFT"].includes(String(b.scaling)) ? String(b.scaling) : "NONE") as "NONE" | "ZSCORE" | "SHIFT", minEvaluators: Math.max(1, Math.min(6, Math.round(num(b.minEvaluators, 1)))), minMeetings: Math.max(0, Math.min(60, Math.round(num(b.minMeetings, 0)))) };
        try { await saveCycleExtra(cycle.id, x); } catch { return bad(FYP_EXTRA_HINT, 500); }
        await audit("FypCycle", cycle.id, x);
        return NextResponse.json({ ok: true });
      }
      case "coSupervisor": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const g = await prisma.fypGroup.findFirst({ where: { id: String(b.groupId || ""), cycleId: cycle.id } });
        if (!g) return bad("group not found", 404);
        const uid = b.userId ? String(b.userId) : null;
        if (uid && uid === g.supervisorId) return bad("The supervisor can't also be the co-supervisor.");
        const { setCoSupervisor, FYP_EXTRA_HINT } = await import("../../../../lib/fypScaling");
        try { await setCoSupervisor(g.id, uid); } catch { return bad(FYP_EXTRA_HINT, 500); }
        await audit("FypGroup", g.id, { coSupervisor: uid || "" });
        return NextResponse.json({ ok: true });
      }
      case "updateCycle": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const sp = num(b.supervisorPct, cycle.supervisorPct), ip = num(b.internalPct, cycle.internalPct), ep = num(b.externalPct, cycle.externalPct);
        if (Math.abs(sp + ip + ep - 100) > 0.01 || sp < 0 || ip < 0 || ep < 0) return bad("Supervisor, internal and external shares must add up to 100%.");
        const minG = Math.max(1, Math.round(num(b.minGroupSize, cycle.minGroupSize))), maxG = Math.max(minG, Math.round(num(b.maxGroupSize, cycle.maxGroupSize)));
        let cutoffsJson = cycle.cutoffsJson;
        // Cut-offs come as a list, or as text such as "A 85, A- 80, B+ 75".
        const rawCut: unknown[] | null = Array.isArray(b.cutoffs) ? b.cutoffs
          : typeof b.cutoffs === "string" && b.cutoffs.trim() ? b.cutoffs.split(/[,;\n]+/).filter((x: string) => x.trim()).map((x: string) => { const m = x.trim().match(/^([A-Za-z][+-]?)\s*[:=]?\s*(\d+(?:\.\d+)?)$/); return m ? { letter: m[1].toUpperCase(), minPct: m[2] } : { letter: "", minPct: -1 }; })
          : null;
        if (rawCut) {
          const cut = rawCut.map((c) => { const x = c as { letter?: unknown; minPct?: unknown }; return { letter: str(x.letter, 3), minPct: num(x.minPct, -1) }; });
          if (!cut.length || cut.some((c) => !c.letter || c.minPct < 0 || c.minPct > 100)) return bad("Write the grade cut-offs as letter and minimum %, e.g. \"A 85, B 70, C 60, D 50, F 0\".");
          cutoffsJson = JSON.stringify(cut.sort((x, y) => y.minPct - x.minPct));
        }
        const c = await prisma.fypCycle.update({
          where: { id: cycle.id },
          data: {
            title: str(b.title, 120) || cycle.title, status: b.status === "CLOSED" ? "CLOSED" : "OPEN",
            termName: b.termName === "Spring" ? "Spring" : b.termName === "Fall" ? "Fall" : cycle.termName, termYear: Math.round(num(b.termYear, cycle.termYear)),
            courseCode: str(b.courseCode, 20) || cycle.courseCode, courseTitle: str(b.courseTitle, 120) || cycle.courseTitle, creditHours: Math.max(1, Math.round(num(b.creditHours, cycle.creditHours))),
            supervisorPct: sp, internalPct: ip, externalPct: ep, minGroupSize: minG, maxGroupSize: maxG,
            minCgpa: Math.max(0, Math.min(4, num(b.minCgpa, cycle.minCgpa))), minCreditHours: Math.max(0, Math.round(num(b.minCreditHours, cycle.minCreditHours))),
            maxApplications: Math.max(1, Math.round(num(b.maxApplications, cycle.maxApplications))), cutoffsJson,
          },
        });
        await audit("FypCycle", c.id);
        return NextResponse.json({ cycle: c });
      }
      case "saveMilestones": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const list = Array.isArray(b.milestones) ? b.milestones : [];
        const rows = list.map((m: Record<string, unknown>, i: number) => ({ id: str(m.id, 60) || null, kind: MILESTONE_KINDS[String(m.kind)] ? String(m.kind) : "OTHER", title: str(m.title, 120), dueDate: str(m.dueDate, 10), weightPct: Math.max(0, num(m.weightPct)), orderIndex: i, evaluatorMode: ["PANEL", "SUPERVISOR_ONLY", "SINGLE"].includes(String(m.evaluatorMode)) ? String(m.evaluatorMode) : "PANEL" }));
        if (rows.some((r: { title: string; dueDate: string }) => !r.title || !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate))) return bad("Every milestone needs a title and a due date.");
        const total = rows.reduce((n: number, r: { weightPct: number }) => n + r.weightPct, 0);
        if (Math.abs(total - 100) > 0.01) return bad(`The evaluated milestones' weights must add up to 100% (now ${total}%).`);
        const keep = rows.filter((r: { id: string | null }) => r.id).map((r: { id: string }) => r.id);
        const used = await prisma.fypScore.findMany({ where: { milestoneId: { notIn: keep.length ? keep : ["none"] }, groupId: { in: (await prisma.fypGroup.findMany({ where: { cycleId: cycle.id }, select: { id: true } })).map((g) => g.id).concat(["none"]) } }, select: { milestoneId: true }, take: 1 });
        if (used.length) return bad("A milestone that already has scores can't be removed.");
        await prisma.$transaction([
          prisma.fypMilestone.deleteMany({ where: { cycleId: cycle.id, id: { notIn: keep.length ? keep : ["none"] } } }),
          ...rows.map((r: { id: string | null; kind: string; title: string; dueDate: string; weightPct: number; orderIndex: number; evaluatorMode: string }) => r.id
            ? prisma.fypMilestone.update({ where: { id: r.id }, data: { kind: r.kind, title: r.title, dueDate: new Date(r.dueDate + "T00:00:00Z"), weightPct: r.weightPct, orderIndex: r.orderIndex, evaluatorMode: r.evaluatorMode } as never })
            : prisma.fypMilestone.create({ data: { cycleId: cycle.id, kind: r.kind, title: r.title, dueDate: new Date(r.dueDate + "T00:00:00Z"), weightPct: r.weightPct, orderIndex: r.orderIndex, evaluatorMode: r.evaluatorMode } as never })),
        ]);
        await audit("FypCycle", cycle.id, { milestones: rows.length });
        return NextResponse.json({ ok: true });
      }
      case "saveRubric": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const list = Array.isArray(b.criteria) ? b.criteria : [];
        const rows = list.map((c: Record<string, unknown>, i: number) => ({ id: str(c.id, 60) || null, name: str(c.name, 120), description: str(c.description, 500) || null, bloomLevel: str(c.bloomLevel, 4).toUpperCase() || null, ploNumber: c.ploNumber === "" || c.ploNumber === null || c.ploNumber === undefined ? null : Math.round(num(c.ploNumber)), maxScore: Math.max(1, num(c.maxScore, 10)), appliesTo: c.appliesTo === "GROUP" ? "GROUP" : "INDIVIDUAL", orderIndex: i }));
        if (!rows.length || rows.some((r: { name: string }) => !r.name)) return bad("Give every criterion a name.");
        const keep = rows.filter((r: { id: string | null }) => r.id).map((r: { id: string }) => r.id);
        if (await prisma.fypScore.count({ where: { criterionId: { in: (await prisma.fypRubricCriterion.findMany({ where: { cycleId: cycle.id, id: { notIn: keep.length ? keep : ["none"] } }, select: { id: true } })).map((c) => c.id).concat(["none"]) } } })) return bad("A criterion that already has scores can't be removed.");
        await prisma.$transaction([
          prisma.fypRubricCriterion.deleteMany({ where: { cycleId: cycle.id, id: { notIn: keep.length ? keep : ["none"] } } }),
          ...rows.map((r: { id: string | null; name: string; description: string | null; bloomLevel: string | null; ploNumber: number | null; maxScore: number; appliesTo: string; orderIndex: number }) => {
            const { id, ...data } = r;
            return id ? prisma.fypRubricCriterion.update({ where: { id }, data }) : prisma.fypRubricCriterion.create({ data: { cycleId: cycle.id, ...data } });
          }),
        ]);
        await audit("FypCycle", cycle.id, { criteria: rows.length });
        return NextResponse.json({ ok: true });
      }

      // ---- Proposal review
      case "reviewProposal": {
        const p = await prisma.fypProposal.findUnique({ where: { id: str(b.proposalId, 60) } });
        const pc = p ? await prisma.fypCycle.findFirst({ where: { id: p.cycleId, chairmanId: acc.chairmanId } }) : null;
        if (!p || !pc || !acc.manages(pc.departmentId)) return bad("forbidden", 403);
        const status = ["APPROVED", "REVISION", "REJECTED"].includes(b.status) ? b.status : null;
        const note = str(b.note, 2000);
        if (!status) return bad("Approve, return for revision or reject.");
        if (status !== "APPROVED" && note.length < 5) return bad("Say why, so the proposer can act on it.");
        const row = await prisma.fypProposal.update({ where: { id: p.id }, data: { status, reviewNote: note || null, reviewedById: user.id, reviewedAt: new Date() } });
        await notifyUsers([p.proposerId], { kind: "FYP", title: `Your FYP proposal "${p.title}" was ${status === "APPROVED" ? "approved" : status === "REVISION" ? "returned for revision" : "rejected"}`, body: note, href: "/fyp?tab=proposals", exceptId: user.id });
        await audit("FypProposal", p.id, { status });
        return NextResponse.json({ proposal: row });
      }

      // ---- Panels
      case "savePanel": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const name = str(b.name, 120);
        if (!name) return bad("Name the panel.");
        const data = { name, domain: str(b.domain, 200) || null, venue: str(b.venue, 120) || null, sessionAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str(b.sessionAt, 20)) ? new Date(str(b.sessionAt, 20) + ":00Z") : null };
        const id = str(b.panelId, 60);
        const row = id ? await prisma.fypPanel.update({ where: { id, cycleId: cycle.id }, data }) : await prisma.fypPanel.create({ data: { cycleId: cycle.id, ...data } });
        await audit("FypPanel", row.id);
        return NextResponse.json({ panel: row });
      }
      case "deletePanel": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const id = str(b.panelId, 60);
        await prisma.$transaction([
          prisma.fypGroup.updateMany({ where: { cycleId: cycle.id, panelId: id }, data: { panelId: null } }),
          prisma.fypPanelMember.deleteMany({ where: { panelId: id } }),
          prisma.fypPanel.deleteMany({ where: { id, cycleId: cycle.id } }),
        ]);
        return NextResponse.json({ ok: true });
      }
      case "addPanelMember": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const panel = await prisma.fypPanel.findFirst({ where: { id: str(b.panelId, 60), cycleId: cycle.id } });
        if (!panel) return bad("panel not found", 404);
        const role = b.role === "CHAIR" ? "CHAIR" : b.role === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
        if (role === "EXTERNAL") {
          const ext = await prisma.fypExternal.findFirst({ where: { id: str(b.externalId, 60), cycleId: cycle.id } });
          if (!ext) return bad("Add the external evaluator first.");
          if (await prisma.fypPanelMember.findFirst({ where: { panelId: panel.id, externalId: ext.id } })) return bad("Already on this panel.");
          return NextResponse.json({ member: await prisma.fypPanelMember.create({ data: { panelId: panel.id, externalId: ext.id, role } }) });
        }
        const person = await prisma.user.findUnique({ where: { id: str(b.userId, 60) }, select: { id: true } });
        if (!person) return bad("Choose a faculty member.");
        if (await prisma.fypPanelMember.findFirst({ where: { panelId: panel.id, userId: person.id } })) return bad("Already on this panel.");
        // A supervisor never examines their own group as a panel member.
        const own = await prisma.fypGroup.findFirst({ where: { panelId: panel.id, supervisorId: person.id }, select: { name: true } });
        if (own) return bad(`This teacher supervises "${own.name}", which this panel examines. Move that group to another panel first.`);
        const m = await prisma.fypPanelMember.create({ data: { panelId: panel.id, userId: person.id, role } });
        await notifyUsers([person.id], { kind: "FYP", title: `You are on the FYP panel "${panel.name}"`, body: panel.sessionAt ? `Session: ${panel.sessionAt.toISOString().slice(0, 16).replace("T", " ")}${panel.venue ? `, ${panel.venue}` : ""}` : "", href: "/fyp?tab=panels", exceptId: user.id });
        return NextResponse.json({ member: m });
      }
      case "removePanelMember": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const m = await prisma.fypPanelMember.findUnique({ where: { id: str(b.memberId, 60) } });
        if (!m || !(await prisma.fypPanel.findFirst({ where: { id: m.panelId, cycleId: cycle.id } }))) return bad("not found", 404);
        await prisma.fypPanelMember.delete({ where: { id: m.id } });
        return NextResponse.json({ ok: true });
      }
      case "addExternal": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const name = str(b.name, 120), email = str(b.email, 160).toLowerCase();
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter the evaluator's name and a valid email.");
        const t = newExternalToken();
        const days = Math.max(1, Math.min(365, Math.round(num(b.days, 60))));
        const ext = await prisma.fypExternal.create({ data: { chairmanId: acc.chairmanId, cycleId: cycle.id, name, email, organization: str(b.organization, 160) || null, designation: str(b.designation, 120) || null, expertise: str(b.expertise, 300) || null, tokenHash: t.hash, expiresAt: new Date(Date.now() + days * 86400000), createdById: user.id } });
        await audit("FypExternal", ext.id, { email });
        // The link is returned once, for the FYP Head to send; only its hash is stored.
        return NextResponse.json({ external: { ...ext, tokenHash: undefined }, link: `/fyp/external/${t.raw}` });
      }
      case "renewExternal": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const ext = await prisma.fypExternal.findFirst({ where: { id: str(b.externalId, 60), cycleId: cycle.id } });
        if (!ext) return bad("not found", 404);
        const t = newExternalToken();
        await prisma.fypExternal.update({ where: { id: ext.id }, data: { tokenHash: t.hash, expiresAt: new Date(Date.now() + 60 * 86400000) } });
        return NextResponse.json({ link: `/fyp/external/${t.raw}` });
      }
      case "assignPanel": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const g = await prisma.fypGroup.findFirst({ where: { id: str(b.groupId, 60), cycleId: cycle.id } });
        if (!g) return bad("group not found", 404);
        const panelId = str(b.panelId, 60) || null;
        if (panelId) {
          if (!(await prisma.fypPanel.findFirst({ where: { id: panelId, cycleId: cycle.id } }))) return bad("panel not found", 404);
          if (g.supervisorId && (await prisma.fypPanelMember.findFirst({ where: { panelId, userId: g.supervisorId } }))) return bad("The group's supervisor sits on that panel — a supervisor can't examine their own group.");
        }
        await prisma.fypGroup.update({ where: { id: g.id }, data: { panelId } });
        return NextResponse.json({ ok: true });
      }
      case "autoAssign": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const r = await autoAssignPanels(cycle.id, b.onlyUnassigned !== false);
        if ("error" in r) return bad(r.error as string);
        await audit("FypCycle", cycle.id, { assigned: r.assigned });
        return NextResponse.json(r);
      }

      // ---- Results
      case "consolidate": {
        if (!managesCycle || !cycle) return bad("forbidden", 403);
        const r = await consolidate(cycle.id, user, b.allowRoleGaps === true);
        if ("error" in r) return bad(r.error as string);
        await audit("FypCycle", cycle.id, { saved: r.saved, held: r.held });
        return NextResponse.json(r);
      }
      case "signOff": {
        if (!cycle || !acc.chairs(cycle.departmentId)) return bad("Only the department's Chairman signs off FYP results.", 403);
        const r = await signOff(cycle.id, user, b.approve === true, str(b.note, 2000));
        if ("error" in r) return bad(r.error as string);
        await audit("FypCycle", cycle.id, { approved: b.approve === true });
        return NextResponse.json(r);
      }

      // ---- Groups: extension, early warning, requisitions
      case "extend": case "clearRisk": case "decideRequisition": {
        const g = await prisma.fypGroup.findUnique({ where: { id: str(b.groupId, 60) } });
        const gc = g ? await prisma.fypCycle.findFirst({ where: { id: g.cycleId, chairmanId: acc.chairmanId } }) : null;
        if (!g || !gc || !acc.manages(gc.departmentId)) return bad("Only the FYP Head or Committee can do this.", 403);
        if (action === "extend") {
          const r = await grantExtension(g.id, user, { kind: String(b.kind || ""), reason: str(b.reason, 3000), followUpAt: str(b.followUpAt, 10) || null });
          if ("error" in r) return bad(r.error as string);
          await audit("FypGroup", g.id, { kind: String(b.kind) });
          return NextResponse.json(r);
        }
        if (action === "clearRisk") {
          await prisma.fypGroup.update({ where: { id: g.id }, data: { atRisk: false, riskNote: str(b.note, 1000) ? `${g.riskNote || ""}\nCleared: ${str(b.note, 1000)}` : g.riskNote } });
          return NextResponse.json({ ok: true });
        }
        const r = await prisma.fypRequisition.findFirst({ where: { id: str(b.requisitionId, 60), groupId: g.id } });
        if (!r) return bad("not found", 404);
        const status = ["APPROVED", "REJECTED", "ISSUED", "REIMBURSED"].includes(b.status) ? b.status : null;
        if (!status) return bad("unknown status");
        await prisma.fypRequisition.update({ where: { id: r.id }, data: { status, decidedById: user.id, decidedAt: new Date(), note: str(b.note, 500) || r.note } });
        await notifyUsers([g.supervisorId], { kind: "FYP", title: `${REQUISITION_KINDS[r.kind] || "Request"} for "${g.name}": ${status.toLowerCase()}`, body: r.item, href: `/fyp/groups/${g.id}`, exceptId: user.id });
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("The FYP tables are not in the database yet — run prisma/migration_fyp.sql in Supabase.", 500);
    console.error("fyp admin", action, msg);
    return bad("Could not save.", 500);
  }
}

// Departments this person belongs to (used by the setup screens).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  return NextResponse.json({ departments: await departmentsOf(user.id) });
}
export const POST = withErrors(POST_handler);
export const GET = withErrors(GET_handler);
