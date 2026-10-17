import { prisma } from "./db";

const fdb = prisma as unknown as Record<string, any>;
export const TASK_SCORE: Record<string, number> = { DONE: 1, PARTIAL: 0.5, NOT_DONE: 0 };
export const ATTENDANCE_SHARE = 20; // % of the supervision mark; tasks are the rest

/** Supervision mark per group|student: attendance (20%) and tasks completed (80%), from the meeting log. */
export async function supervisionPct(groupIds: string[]) {
  const out = new Map<string, number>();
  if (!groupIds.length) return out;
  try {
    const [meetings, tasks, members] = await Promise.all([
      fdb.fypMeeting.findMany({ where: { groupId: { in: groupIds } }, select: { id: true, groupId: true } }) as Promise<{ id: string; groupId: string }[]>,
      fdb.fypMeetingTask.findMany({ where: { groupId: { in: groupIds }, status: { not: "OPEN" } } }) as Promise<{ groupId: string; studentId: string | null; status: string }[]>,
      prisma.fypGroupMember.findMany({ where: { groupId: { in: groupIds }, status: "JOINED" }, select: { groupId: true, studentId: true } }),
    ]);
    const att = (await fdb.fypMeetingAttendance.findMany({ where: { meetingId: { in: meetings.map((m) => m.id) } } })) as { meetingId: string; studentId: string; present: boolean }[];
    for (const mb of members) {
      const ms = meetings.filter((m) => m.groupId === mb.groupId);
      if (!ms.length) continue;
      const mine = att.filter((a) => a.studentId === mb.studentId && ms.some((m) => m.id === a.meetingId));
      const attPct = mine.length ? (100 * mine.filter((a) => a.present).length) / ms.length : 0;
      const t = tasks.filter((x) => x.groupId === mb.groupId && (!x.studentId || x.studentId === mb.studentId));
      const taskPct = t.length ? (100 * t.reduce((s, x) => s + (TASK_SCORE[x.status] ?? 0), 0)) / t.length : null;
      out.set(`${mb.groupId}|${mb.studentId}`, Math.round((taskPct === null ? attPct : (attPct * ATTENDANCE_SHARE + taskPct * (100 - ATTENDANCE_SHARE)) / 100) * 10) / 10);
    }
  } catch { /* tables not created yet */ }
  return out;
}

export async function meetingLog(groupId: string) {
  try {
    const meetings = (await fdb.fypMeeting.findMany({ where: { groupId }, orderBy: { heldAt: "desc" } })) as { id: string; heldAt: Date; nextAt: Date | null; feedback: string | null }[];
    const ids = meetings.map((m) => m.id);
    const [att, tasks] = await Promise.all([
      fdb.fypMeetingAttendance.findMany({ where: { meetingId: { in: ids } } }) as Promise<{ meetingId: string; studentId: string; present: boolean }[]>,
      fdb.fypMeetingTask.findMany({ where: { groupId }, orderBy: { id: "asc" } }) as Promise<{ id: string; meetingId: string; studentId: string | null; text: string; status: string }[]>,
    ]);
    return meetings.map((m) => ({ ...m, attendance: att.filter((a) => a.meetingId === m.id), tasks: tasks.filter((t) => t.meetingId === m.id) }));
  } catch { return null; }
}

/** Every earlier panel remark for a group, with the students' replies — shown to the next panels. */
export async function remarksOf(groupId: string) {
  const evs = await prisma.fypEvaluation.findMany({ where: { groupId, comments: { not: null } }, orderBy: { updatedAt: "asc" } });
  const replies = (await fdb.fypRemarkReply.findMany({ where: { evaluationId: { in: evs.map((e) => e.id) } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as { evaluationId: string; studentId: string; text: string; addressed: boolean; createdAt: Date }[];
  return evs.filter((e) => (e.comments || "").trim()).map((e) => ({ id: e.id, milestoneId: e.milestoneId, by: e.evaluatorName, role: e.evaluatorRole, text: e.comments as string, at: e.updatedAt, replies: replies.filter((r) => r.evaluationId === e.id) }));
}
