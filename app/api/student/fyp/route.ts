import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { ARTIFACT_KINDS, eligibility, REQUISITION_KINDS, studentCycle } from "../../../../lib/fyp";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Students: form a group, invite classmates, apply to approved projects, and (once accepted) add their artifacts and requests.
async function POST_handler(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return bad("not logged in", 401);
  const cycle = await studentCycle(student.id);
  if (!cycle) return bad("There is no open Final Year Project cycle for your department.");
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  const me = await prisma.fypGroupMember.findUnique({ where: { cycleId_studentId: { cycleId: cycle.id, studentId: student.id } } });
  const group = me ? await prisma.fypGroup.findUnique({ where: { id: me.groupId } }) : null;
  const joined = async (gid: string) => prisma.fypGroupMember.findMany({ where: { groupId: gid, status: "JOINED" } });
  try {
    switch (action) {
      case "submitPoster": {
        if (!group || me?.status !== "JOINED") return bad("You are not in a group.");
        const link = String(b.link || "").trim();
        if (!/^https?:\/\/\S+$/.test(link)) return bad("Paste a link to your poster file (e.g. Google Drive).");
        const n = await (prisma as unknown as Record<string, any>).fypOpenHouseItem.updateMany({ where: { groupId: group.id, kind: "PRINT", status: { in: ["NOT_SUBMITTED", "SUBMITTED"] } }, data: { note: link.slice(0, 500), status: "SUBMITTED" } });
        if (!n.count) return bad("No poster is expected from your group, or it is already approved.");
        return NextResponse.json({ ok: true });
      }
      case "status": {
        if (!group || me?.status !== "JOINED") return bad("You are not in a group.");
        await (prisma as unknown as Record<string, any>).fypPlanTask.updateMany({ where: { id: String(b.taskId || ""), groupId: group.id }, data: { status: ["TODO", "IN_PROGRESS", "DONE"].includes(b.status) ? b.status : "TODO" } });
        return NextResponse.json({ ok: true });
      }
      case "replyRemark": {
        if (!group || me?.status !== "JOINED") return bad("You are not in a group.");
        const ev = await prisma.fypEvaluation.findFirst({ where: { id: String(b.evaluationId || ""), groupId: group.id } });
        if (!ev) return bad("remark not found", 404);
        const text = String(b.text || "").trim().slice(0, 2000);
        if (!text) return bad("Write your reply.");
        await (prisma as unknown as Record<string, any>).fypRemarkReply.create({ data: { evaluationId: ev.id, studentId: student.id, text, addressed: !!b.addressed } });
        return NextResponse.json({ ok: true });
      }
      case "createGroup": {
        if (me) return bad(me.status === "INVITED" ? "Answer your group invitation first." : "You are already in a group.");
        const el = await eligibility(student.id, cycle);
        if (!el.ok) return bad(`You are not eligible yet: ${el.reasons.join("; ")}.`);
        const name = str(b.name, 80);
        if (name.length < 3) return bad("Give your group a name.");
        const g = await prisma.fypGroup.create({ data: { cycleId: cycle.id, name, leaderId: student.id } });
        await prisma.fypGroupMember.create({ data: { cycleId: cycle.id, groupId: g.id, studentId: student.id, status: "JOINED" } });
        return NextResponse.json({ group: g });
      }
      case "invite": {
        if (!group || group.leaderId !== student.id || group.status !== "FORMING") return bad("Only the group leader invites, before the group is accepted for a project.");
        const roll = str(b.rollNumber, 40);
        const candidates = await prisma.student.findMany({ where: { rollNumber: roll }, select: { id: true, name: true } });
        let target: { id: string; name: string } | null = null;
        for (const c of candidates) if ((await studentCycle(c.id))?.id === cycle.id) { target = c; break; }
        if (!target) return bad("No student with that roll number in your department.");
        if (await prisma.fypGroupMember.findUnique({ where: { cycleId_studentId: { cycleId: cycle.id, studentId: target.id } } })) return bad(`${target.name} is already in a group or has an invitation.`);
        const count = await prisma.fypGroupMember.count({ where: { groupId: group.id } });
        if (count >= cycle.maxGroupSize) return bad(`A group has at most ${cycle.maxGroupSize} students.`);
        const el = await eligibility(target.id, cycle);
        if (!el.ok) return bad(`${target.name} is not eligible yet: ${el.reasons.join("; ")}.`);
        await prisma.fypGroupMember.create({ data: { cycleId: cycle.id, groupId: group.id, studentId: target.id, status: "INVITED" } });
        return NextResponse.json({ ok: true, name: target.name });
      }
      case "respondInvite": {
        if (!me || me.status !== "INVITED" || !group) return bad("You have no invitation.");
        if (b.accept === true) {
          if (group.status !== "FORMING") return bad("That group already has a project.");
          const el = await eligibility(student.id, cycle);
          if (!el.ok) return bad(`You are not eligible yet: ${el.reasons.join("; ")}.`);
          await prisma.fypGroupMember.update({ where: { id: me.id }, data: { status: "JOINED" } });
        } else await prisma.fypGroupMember.delete({ where: { id: me.id } });
        return NextResponse.json({ ok: true });
      }
      case "removeMember": case "leave": {
        if (!group || group.status !== "FORMING") return bad("Members can't change after the group is accepted for a project.");
        if (action === "removeMember") {
          if (group.leaderId !== student.id) return bad("Only the leader removes members.");
          await prisma.fypGroupMember.deleteMany({ where: { groupId: group.id, studentId: str(b.studentId, 60), NOT: { studentId: student.id } } });
          return NextResponse.json({ ok: true });
        }
        if (group.leaderId === student.id) {
          // The leader leaving breaks the group up.
          await prisma.$transaction([
            prisma.fypApplication.deleteMany({ where: { groupId: group.id } }),
            prisma.fypGroupMember.deleteMany({ where: { groupId: group.id } }),
            prisma.fypGroup.delete({ where: { id: group.id } }),
          ]);
        } else await prisma.fypGroupMember.delete({ where: { id: me!.id } });
        return NextResponse.json({ ok: true });
      }
      case "apply": {
        if (!group || group.leaderId !== student.id) return bad("Only the group leader applies.");
        if (group.status !== "FORMING") return bad("Your group already has a project.");
        const members = await joined(group.id);
        if (members.length < cycle.minGroupSize || members.length > cycle.maxGroupSize) return bad(`A group needs ${cycle.minGroupSize} to ${cycle.maxGroupSize} members who have joined (yours has ${members.length}).`);
        if (await prisma.fypGroupMember.count({ where: { groupId: group.id, status: "INVITED" } })) return bad("Wait until everyone you invited has answered (or remove them).");
        for (const m of members) {
          const el = await eligibility(m.studentId, cycle);
          if (!el.ok) return bad(`A member is not eligible: ${el.reasons.join("; ")}.`);
        }
        const p = await prisma.fypProposal.findFirst({ where: { id: str(b.proposalId, 60), cycleId: cycle.id, status: "APPROVED" } });
        if (!p) return bad("That project is not open for applications.");
        if (await prisma.fypApplication.count({ where: { proposalId: p.id, status: "ACCEPTED" } }) >= p.maxGroups) return bad("That project is full.");
        if (await prisma.fypApplication.count({ where: { groupId: group.id, status: "PENDING" } }) >= cycle.maxApplications) return bad(`You can have at most ${cycle.maxApplications} applications waiting at a time.`);
        const a = await prisma.fypApplication.upsert({
          where: { groupId_proposalId: { groupId: group.id, proposalId: p.id } },
          create: { groupId: group.id, proposalId: p.id, message: str(b.message, 2000) || null },
          update: { status: "PENDING", message: str(b.message, 2000) || null, note: null, decidedById: null, decidedAt: null },
        });
        await notifyUsers([p.proposerId], { kind: "FYP", title: `FYP group "${group.name}" applied for "${p.title}"`, body: `${members.length} students. Review their profiles and accept or decline.`, href: "/fyp?tab=requests" });
        await writeAuditLog({ action: "FYP_APPLICATION", entityType: "FypApplication", entityId: a.id, metadata: { studentId: student.id } });
        return NextResponse.json({ application: a });
      }
      case "withdrawApplication": {
        if (!group || group.leaderId !== student.id) return bad("Only the group leader withdraws.");
        await prisma.fypApplication.updateMany({ where: { id: str(b.applicationId, 60), groupId: group.id, status: "PENDING" }, data: { status: "WITHDRAWN" } });
        return NextResponse.json({ ok: true });
      }
      case "addArtifact": case "requestRequisition": {
        if (!group || me?.status !== "JOINED" || group.status !== "ACTIVE") return bad("Your group must be accepted for a project first.");
        if (action === "addArtifact") {
          const url = str(b.url, 500);
          if (!ARTIFACT_KINDS[b.kind] || !/^https?:\/\/\S+$/i.test(url)) return bad("Choose the kind of artifact and give a full link (https://…).");
          const sim = b.similarityPct === "" || b.similarityPct === null || b.similarityPct === undefined ? null : Number(b.similarityPct);
          if (sim !== null && (!Number.isFinite(sim) || sim < 0 || sim > 100)) return bad("Similarity must be between 0 and 100%.");
          const row = await prisma.fypArtifact.create({ data: { groupId: group.id, kind: b.kind, url, similarityPct: sim, note: str(b.note, 300) || null, addedBy: `student:${student.id}` } });
          return NextResponse.json({ artifact: row });
        }
        if (!REQUISITION_KINDS[b.kind] || !str(b.item, 200)) return bad("Choose the kind of request and describe the item.");
        const amount = b.amount === "" || b.amount === null || b.amount === undefined ? null : Math.max(0, Number(b.amount) || 0);
        const row = await prisma.fypRequisition.create({ data: { groupId: group.id, kind: b.kind, item: str(b.item, 200), details: str(b.details, 2000) || null, amount, sponsor: str(b.sponsor, 160) || null, requestedBy: `student:${student.id}` } });
        await notifyUsers([group.supervisorId], { kind: "FYP", title: `FYP ${REQUISITION_KINDS[b.kind].toLowerCase()} request from "${group.name}"`, body: row.item, href: `/fyp/groups/${group.id}` });
        return NextResponse.json({ requisition: row });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("Final Year Projects are not set up yet. Please try again later.", 500);
    if (msg.includes("Unique constraint")) return bad("That student is already in a group or invited.", 400);
    console.error("student fyp", action, msg);
    return bad("Could not save.", 500);
  }
}
export const POST = withErrors(POST_handler);
