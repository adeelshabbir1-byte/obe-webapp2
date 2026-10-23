import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { refreshDashboard } from "./headDashboard";

// Dream University's Institute Dashboard: the VC's own targets for a few figures, then the figures worked out (as the
// nightly job does). Targets already set are left alone; the figures are worked out again each time.
export async function campusDashboard() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const done: string[] = [];
  try {
    for (const [key, target] of [["passRate", 85], ["readiness", 80], ["atRisk", 15], ["research", 8], ["budget", 40]] as const) {
      if (await rdb.dashboardTarget.count({ where: { chairmanId: head.id, key } })) continue;
      await rdb.dashboardTarget.create({ data: { id: randomUUID(), chairmanId: head.id, key, target, updatedById: head.id } });
      done.push(`target ${key}: ${target}`);
    }
    const s = await refreshDashboard(head.id);
    done.push(`figures worked out for ${s.programs.length} programs and ${s.departments.length} departments`);
  } catch (e) { throw new Error(`Run prisma/migration_head_dashboard.sql first (${String((e as Error).message || e).slice(0, 120)}).`); }
  return done;
}
