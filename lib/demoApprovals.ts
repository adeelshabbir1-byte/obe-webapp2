import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";

// Dream University's approvals inbox: the BBA Head of Department has handed their approvals to the CS Head of
// Department for three weeks (so dream.hod.cs sees an "acting for" banner and BBA items), and the VC has set shorter
// reminder / escalation days for leave and course results. Skipped when already there.

export async function campusApprovals() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  const users = await prisma.user.findMany({ where: { username: { in: ["dream.hod.bba", "dream.hod.cs"] } }, select: { id: true, username: true } });
  const bba = users.find((u) => u.username === "dream.hod.bba"), cs = users.find((u) => u.username === "dream.hod.cs");
  const done: string[] = [];
  try {
    if (bba && cs && !(await rdb.approvalDelegation.count({ where: { chairmanId: H, fromUserId: bba.id, revokedAt: null, endDate: { gte: new Date() } } }))) {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 2);
      const end = new Date(start.getTime() + 21 * 864e5 - 1);
      await rdb.approvalDelegation.create({ data: { id: randomUUID(), chairmanId: H, fromUserId: bba.id, toUserId: cs.id, startDate: start, endDate: end, note: "On leave for a conference in Lahore.", createdById: bba.id } });
      done.push("BBA Head of Department's approvals handed to the CS Head of Department for three weeks");
    }
    for (const [kind, remind, esc] of [["LEAVE", 1, 3], ["RESULT", 2, 5], ["FEE_REFUND", 3, 10]] as const) {
      if (await rdb.approvalSetting.count({ where: { chairmanId: H, kind } })) continue;
      await rdb.approvalSetting.create({ data: { id: randomUUID(), chairmanId: H, kind, remindAfterDays: remind, escalateAfterDays: esc } });
      done.push(`${kind.toLowerCase().replace("_", " ")}: remind after ${remind} day(s), escalate after ${esc}`);
    }
  } catch { throw new Error("Run prisma/migration_approvals_inbox.sql first."); }
  return done.length ? done : ["Approvals inbox demo already there"];
}
