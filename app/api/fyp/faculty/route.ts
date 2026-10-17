import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { ARTIFACT_KINDS, evaluatorRoleFor, fypAccess, REQUISITION_KINDS, saveScores } from "../../../../lib/fyp";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isUrl = (u: string) => /^https?:\/\/\S+$/i.test(u);

// What any faculty member does in FYPs: propose projects, accept student groups, supervise, sit on panels and score.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const acc = await fypAccess(user);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  try {
    switch (action) {
      case "submitProposal": {
        const id = str(b.proposalId, 60);
        const existing = id ? await prisma.fypProposal.findFirst({ where: { id, proposerId: user.id } }) : null;
        if (id && !existing) return bad("not found", 404);
        if (existing && ["APPROVED", "REJECTED"].includes(existing.status)) return bad("An approved or rejected proposal can't be changed.");
        const cycle = await prisma.fypCycle.findFirst({ where: { id: existing?.cycleId || str(b.cycleId, 60), chairmanId: acc.chairmanId, status: "OPEN" } });
        if (!cycle) return bad("Choose an open FYP cycle.");
        const title = str(b.title, 200), abstract = str(b.abstract, 5000);
        if (title.length < 5 || abstract.length < 30) return bad("Give the project a title and an abstract of a few sentences.");
        const plos = Array.isArray(b.ploNumbers) ? b.ploNumbers.map((n: unknown) => Math.round(Number(n))).filter((n: number) => n >= 1 && n <= 20) : [];
        const data = {
          title, abstract, domain: str(b.domain, 160) || null, scope: str(b.scope, 5000) || null, skills: str(b.skills, 500) || null,
          hardware: str(b.hardware, 500) || null, software: str(b.software, 500) || null, outcomes: str(b.outcomes, 3000) || null, societalIssue: str(b.societalIssue, 2000) || null,
          ploNumbers: Array.from(new Set<number>(plos)).sort((x, y) => x - y), maxGroups: Math.max(1, Math.min(5, Math.round(Number(b.maxGroups) || 1))), status: "SUBMITTED",
        };
        const row = existing ? await prisma.fypProposal.update({ where: { id: existing.id }, data }) : await prisma.fypProposal.create({ data: { cycleId: cycle.id, proposerId: user.id, ...data } });
        const staff = (await prisma.fypStaff.findMany({ where: { departmentId: cycle.departmentId } })).map((s) => s.userId);
        await notifyUsers(staff, { kind: "FYP", title: `FYP proposal ${existing ? "resubmitted" : "submitted"}: ${title}`, body: `By ${user.name}.`, href: `/fyp/manage?cycle=${cycle.id}&tab=proposals`, exceptId: user.id });
        await writeAuditLog({ actorUserId: user.id, action: "FYP_PROPOSAL_SUBMITTED", entityType: "FypProposal", entityId: row.id });
        return NextResponse.json({ proposal: row });
      }
      case "withdrawProposal": {
        const p = await prisma.fypProposal.findFirst({ where: { id: str(b.proposalId, 60), proposerId: user.id } });
        if (!p) return bad("not found", 404);
        if (await prisma.fypApplication.count({ where: { proposalId: p.id, status: "ACCEPTED" } })) return bad("A group is already working on this project.");
        await prisma.$transaction([
          prisma.fypProposal.update({ where: { id: p.id }, data: { status: "WITHDRAWN" } }),
          prisma.fypApplication.updateMany({ where: { proposalId: p.id, status: "PENDING" }, data: { status: "DECLINED", note: "The proposal was withdrawn.", decidedById: user.id, decidedAt: new Date() } }),
        ]);
        return NextResponse.json({ ok: true });
      }
      case "decideApplication": {
        const a = await prisma.fypApplication.findUnique({ where: { id: str(b.applicationId, 60) } });
        const p = a ? await prisma.fypProposal.findFirst({ where: { id: a.proposalId, proposerId: user.id } }) : null;
        if (!a || !p) return bad("Only the teacher who proposed the project decides.", 403);
        if (a.status !== "PENDING") return bad("This request has already been answered.");
        const accept = b.accept === true, note = str(b.note, 500);
        if (!accept) {
          await prisma.fypApplication.update({ where: { id: a.id }, data: { status: "DECLINED", note: note || null, decidedById: user.id, decidedAt: new Date() } });
          return NextResponse.json({ ok: true });
        }
        if (p.status !== "APPROVED") return bad("The proposal must be approved by the FYP Head first.");
        const taken = await prisma.fypApplication.count({ where: { proposalId: p.id, status: "ACCEPTED" } });
        if (taken >= p.maxGroups) return bad("This project already has as many groups as it takes.");
        const group = await prisma.fypGroup.findUnique({ where: { id: a.groupId } });
        if (!group || group.proposalId) return bad("This group already has a project.");
        const full = taken + 1 >= p.maxGroups;
        await prisma.$transaction([
          prisma.fypApplication.update({ where: { id: a.id }, data: { status: "ACCEPTED", note: note || null, decidedById: user.id, decidedAt: new Date() } }),
          prisma.fypGroup.update({ where: { id: group.id }, data: { proposalId: p.id, supervisorId: user.id, status: "ACTIVE" } }),
          prisma.fypApplication.updateMany({ where: { groupId: group.id, status: "PENDING", id: { not: a.id } }, data: { status: "WITHDRAWN", note: "The group was accepted for another project." } }),
          ...(full ? [prisma.fypApplication.updateMany({ where: { proposalId: p.id, status: "PENDING", id: { not: a.id } }, data: { status: "DECLINED", note: "The project is full.", decidedById: user.id, decidedAt: new Date() } })] : []),
        ]);
        await writeAuditLog({ actorUserId: user.id, action: "FYP_GROUP_ACCEPTED", entityType: "FypGroup", entityId: group.id, metadata: { proposalId: p.id } });
        return NextResponse.json({ ok: true });
      }
      // ---- Supervisor meetings: attendance, feedback, tasks, next date; earlier tasks reviewed at this meeting.
      case "addMeeting": case "reviewTask": {
        const group = await prisma.fypGroup.findUnique({ where: { id: str(b.groupId, 60) } });
        if (!group) return bad("group not found", 404);
        const cycle = await prisma.fypCycle.findUnique({ where: { id: group.cycleId } });
        if (group.supervisorId !== user.id && !(cycle && acc.manages(cycle.departmentId))) return bad("Only the group's supervisor records meetings.", 403);
        const fdb = prisma as unknown as Record<string, any>;
        if (action === "reviewTask") {
          const status = ["DONE", "PARTIAL", "NOT_DONE", "OPEN"].includes(String(b.status)) ? String(b.status) : "OPEN";
          await fdb.fypMeetingTask.updateMany({ where: { id: str(b.taskId, 60), groupId: group.id }, data: { status, reviewedAt: status === "OPEN" ? null : new Date() } });
          return NextResponse.json({ ok: true });
        }
        const heldAt = new Date(str(b.heldAt, 30) || Date.now());
        if (isNaN(heldAt.getTime())) return bad("Meeting date is not valid.");
        const nextAt = b.nextAt ? new Date(str(b.nextAt, 30)) : null;
        const members = await prisma.fypGroupMember.findMany({ where: { groupId: group.id, status: "JOINED" }, select: { studentId: true } });
        const present = new Set(Array.isArray(b.present) ? b.present.map(String) : []);
        const meeting = await fdb.fypMeeting.create({ data: { groupId: group.id, heldAt, nextAt: nextAt && !isNaN(nextAt.getTime()) ? nextAt : null, feedback: str(b.feedback, 4000) || null, createdById: user.id } });
        await fdb.fypMeetingAttendance.createMany({ data: members.map((m) => ({ meetingId: meeting.id, studentId: m.studentId, present: present.has(m.studentId) })) });
        const tasks = (Array.isArray(b.tasks) ? b.tasks : []).map((t: { text?: string; studentId?: string }) => ({ text: str(t.text, 500), studentId: t.studentId && members.some((m) => m.studentId === t.studentId) ? String(t.studentId) : null })).filter((t: { text: string }) => t.text);
        if (tasks.length) await fdb.fypMeetingTask.createMany({ data: tasks.map((t: { text: string; studentId: string | null }) => ({ meetingId: meeting.id, groupId: group.id, studentId: t.studentId, text: t.text })) });
        await writeAuditLog({ actorUserId: user.id, action: "FYP_MEETING_RECORDED", entityType: "FypGroup", entityId: group.id, metadata: { tasks: tasks.length } });
        return NextResponse.json({ ok: true });
      }
      // ---- A presentation's own panel for a group, and the open-house stall (FYP Head).
      case "setMilestonePanel": case "setStall": {
        const group = await prisma.fypGroup.findUnique({ where: { id: str(b.groupId, 60) } });
        const cycle = group ? await prisma.fypCycle.findUnique({ where: { id: group.cycleId } }) : null;
        if (!group || !cycle || !acc.manages(cycle.departmentId)) return bad("Only the FYP Head can do this.", 403);
        const fdb = prisma as unknown as Record<string, any>;
        if (action === "setStall") { await fdb.fypGroup.update({ where: { id: group.id }, data: { stall: str(b.stall, 40) || null } }); return NextResponse.json({ ok: true }); }
        const milestoneId = str(b.milestoneId, 60), panelId = str(b.panelId, 60);
        if (!panelId) await fdb.fypMilestonePanel.deleteMany({ where: { milestoneId, groupId: group.id } });
        else {
          if (!(await prisma.fypPanel.count({ where: { id: panelId, cycleId: cycle.id } }))) return bad("panel not found", 404);
          await fdb.fypMilestonePanel.upsert({ where: { milestoneId_groupId: { milestoneId, groupId: group.id } }, create: { milestoneId, groupId: group.id, panelId }, update: { panelId } });
        }
        return NextResponse.json({ ok: true });
      }
      case "saveScores": {
        const group = await prisma.fypGroup.findUnique({ where: { id: str(b.groupId, 60) } });
        if (!group) return bad("group not found", 404);
        const ms = await prisma.fypMilestone.findFirst({ where: { id: str(b.milestoneId, 60), cycleId: group.cycleId } });
        const role = await evaluatorRoleFor(user.id, group, ms?.id);
        if (!role) return bad("Only the group's supervisor or a member of its panel for this presentation can evaluate it.", 403);
        if (ms?.kind === "SUPERVISION") return bad("This component is marked from the supervisor meeting log, not a score sheet.");
        if ((ms as unknown as { evaluatorMode?: string } | null)?.evaluatorMode === "SUPERVISOR_ONLY" && role !== "SUPERVISOR") return bad("Only the supervisor evaluates this component.", 403);
        const scores = Array.isArray(b.scores) ? b.scores.map((s: Record<string, unknown>) => ({ criterionId: String(s.criterionId || ""), studentId: String(s.studentId || ""), score: Number(s.score) })) : [];
        if (!scores.length) return bad("Enter the scores.");
        const r = await saveScores({ groupId: group.id, milestoneId: str(b.milestoneId, 60), evaluatorKey: user.id, evaluatorRole: role, evaluatorName: user.name, scores, comments: str(b.comments, 3000), recommendation: String(b.recommendation || "") });
        if ("error" in r) return bad(r.error as string);
        return NextResponse.json({ ok: true, role });
      }
      case "setFlags": case "addArtifact": case "requestRequisition": {
        const group = await prisma.fypGroup.findUnique({ where: { id: str(b.groupId, 60) } });
        if (!group) return bad("group not found", 404);
        const cycle = await prisma.fypCycle.findUnique({ where: { id: group.cycleId } });
        const role = await evaluatorRoleFor(user.id, group);
        const allowed = action === "setFlags" ? !!role || (!!cycle && acc.manages(cycle.departmentId)) : group.supervisorId === user.id || (!!cycle && acc.manages(cycle.departmentId));
        if (!allowed) return bad("forbidden", 403);
        if (action === "setFlags") {
          await prisma.fypGroup.update({ where: { id: group.id }, data: { publicationFlag: b.publicationFlag === true, patentFlag: b.patentFlag === true, incubatorFlag: b.incubatorFlag === true, flagNote: str(b.flagNote, 2000) || null } });
          return NextResponse.json({ ok: true });
        }
        if (action === "addArtifact") {
          const url = str(b.url, 500);
          if (!ARTIFACT_KINDS[b.kind] || !isUrl(url)) return bad("Choose the kind of artifact and give a full link (https://…).");
          const sim = b.similarityPct === "" || b.similarityPct === null || b.similarityPct === undefined ? null : Number(b.similarityPct);
          if (sim !== null && (!Number.isFinite(sim) || sim < 0 || sim > 100)) return bad("Similarity must be between 0 and 100%.");
          const row = await prisma.fypArtifact.create({ data: { groupId: group.id, kind: b.kind, url, similarityPct: sim, note: str(b.note, 300) || null, addedBy: user.id } });
          return NextResponse.json({ artifact: row });
        }
        if (!REQUISITION_KINDS[b.kind] || !str(b.item, 200)) return bad("Choose the kind of request and describe the item.");
        const amount = b.amount === "" || b.amount === null || b.amount === undefined ? null : Math.max(0, Number(b.amount) || 0);
        const row = await prisma.fypRequisition.create({ data: { groupId: group.id, kind: b.kind, item: str(b.item, 200), details: str(b.details, 2000) || null, amount, sponsor: str(b.sponsor, 160) || null, requestedBy: user.id } });
        if (cycle) await notifyUsers((await prisma.fypStaff.findMany({ where: { departmentId: cycle.departmentId } })).map((s) => s.userId), { kind: "FYP", title: `FYP ${REQUISITION_KINDS[b.kind].toLowerCase()} request: ${row.item}`, body: `Group "${group.name}"${amount ? `, PKR ${amount.toLocaleString("en-US")}` : ""}.`, href: `/fyp/groups/${group.id}`, exceptId: user.id });
        return NextResponse.json({ requisition: row });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("The FYP tables are not in the database yet — run prisma/migration_fyp.sql in Supabase.", 500);
    console.error("fyp faculty", action, msg);
    return bad("Could not save.", 500);
  }
}
