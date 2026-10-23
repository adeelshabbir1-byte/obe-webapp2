import { prisma } from "../db";

// The help desk's extra details on each request: kind, priority, screenshot, SLA timer, tags, fix note and FAQ, and
// each institute's support people and SLA hours. Kept beside HelpTicket so the existing desk keeps working unchanged.

const hdb = prisma as unknown as Record<string, any>;
export const DESK_HINT = "Run prisma/migration_help_desk.sql in Supabase for kinds, priorities, screenshots and SLA timers.";
import { CATEGORIES, PRIORITIES, DEFAULT_SLA, STATUS_LABEL } from "./deskLabels";
export { CATEGORIES, PRIORITIES, DEFAULT_SLA, STATUS_LABEL };
export type Extra = { ticketId: string; category: string; priority: string; screenshot: string | null; browser: string | null; pageUrl: string | null; slaDueAt: Date | null; firstResponseAt: Date | null; slaWarnedAt: Date | null; tags: string; fixNote: string | null; releaseRef: string | null; faqArticleId: string | null };
export type DeskSetting = { supportUserIds: string[]; sla: Record<string, number> };

export async function deskSetting(chairmanId: string | null): Promise<DeskSetting> {
  if (!chairmanId) return { supportUserIds: [], sla: DEFAULT_SLA };
  try {
    const r = await hdb.helpDeskSetting.findUnique({ where: { chairmanId } });
    let ids: string[] = [], sla: Record<string, number> = {};
    try { ids = JSON.parse(r?.supportUserIds || "[]"); } catch { ids = []; }
    try { sla = JSON.parse(r?.slaHoursJson || "{}"); } catch { sla = {}; }
    return { supportUserIds: Array.isArray(ids) ? ids : [], sla: { ...DEFAULT_SLA, ...sla } };
  } catch { return { supportUserIds: [], sla: DEFAULT_SLA }; }
}
export async function extrasOf(ids: string[]): Promise<Map<string, Extra>> {
  try { return new Map(((await hdb.helpTicketExtra.findMany({ where: { ticketId: { in: ids.concat(["none"]) } } })) as Extra[]).map((e) => [e.ticketId, e])); } catch { return new Map(); }
}
export async function saveExtra(ticketId: string, data: Partial<Omit<Extra, "ticketId">>) {
  try { await hdb.helpTicketExtra.upsert({ where: { ticketId }, create: { ticketId, ...data }, update: data }); return true; } catch { return false; }
}
/** How the SLA stands: hours left (negative = overdue), or null when answered or not timed. */
export function slaState(e: Extra | undefined, status: string, now = new Date()) {
  if (!e?.slaDueAt || e.firstResponseAt || ["RESOLVED", "CLOSED", "ANSWERED", "WAITING"].includes(status)) return null;
  const h = Math.round(((new Date(e.slaDueAt).getTime() - now.getTime()) / 3600_000) * 10) / 10;
  return { hoursLeft: h, overdue: h < 0 };
}
/** Daily: tell the people answering about requests past their SLA without a first answer (once per request). */
export async function remindHelpSla(now = new Date()) {
  try {
    const late = (await hdb.helpTicketExtra.findMany({ where: { slaDueAt: { lt: now }, firstResponseAt: null, slaWarnedAt: null }, take: 500 })) as Extra[];
    if (!late.length) return 0;
    const tickets = await prisma.helpTicket.findMany({ where: { id: { in: late.map((l) => l.ticketId) }, status: { in: ["OPEN", "IN_PROGRESS"] } } });
    const { notifyUsers } = await import("../notifications");
    let n = 0;
    for (const t of tickets) {
      let ids: string[] = []; try { ids = JSON.parse(t.recipientIds); } catch { ids = []; }
      const e = late.find((l) => l.ticketId === t.id)!;
      await notifyUsers([...ids, t.assignedToId, t.chairmanId], { kind: "HELP", title: `Past its answer time: ${t.subject}`, body: `${e.priority.toLowerCase()} priority, raised by ${t.requesterName}. No answer yet.`, href: `/help/requests?id=${t.id}` });
      await hdb.helpTicketExtra.update({ where: { ticketId: t.id }, data: { slaWarnedAt: now } });
      n++;
    }
    return n;
  } catch { return 0; }
}
