// Menu colours (Adeel prompt §1): each menu item takes the worst status of the person's open tasks on that page.
// No database here (tested on its own). Status order: red (overdue / blocking) > amber (due within N working days) >
// blue (in progress) > none. A task the person marked "waiting on someone else" counts as grey (left out).

export type Status = "red" | "amber" | "blue" | "grey" | "green";
export type MenuTask = { title: string; href: string; due?: Date | string | null; urgency: "overdue" | "soon" | "normal"; detail?: string | null };
export type LinkStatus = { status: Status; count: number; reasons: string[] };
const RANK: Record<Status, number> = { red: 0, amber: 1, blue: 2, grey: 3, green: 4 };
export const worst = (a: Status | null, b: Status | null): Status | null => (!a ? b : !b ? a : RANK[a] <= RANK[b] ? a : b);

/** Working days (Mon–Fri) from now until the date; negative when it has passed. */
export function workingDaysUntil(due: Date, now = new Date()) {
  const a = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const b = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
  if (b < a) return -1;
  let n = 0;
  for (const d = new Date(a); d < b; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

/** A task's colour, with the amber window N (working days) from the settings. */
export function statusOf(t: MenuTask, amberDays: number, now = new Date()): Status {
  if (t.due) {
    const due = new Date(t.due);
    if (due.getTime() < now.getTime()) return "red";
    return workingDaysUntil(due, now) <= amberDays ? "amber" : "blue";
  }
  return t.urgency === "overdue" ? "red" : t.urgency === "soon" ? "amber" : "blue";
}

const segs = (href: string) => href.split(/[?#]/)[0].split("/").filter(Boolean);
/** The menu link a task belongs to: the link whose path is the longest full prefix of the task's path. */
export function linkFor(taskHref: string, linkHrefs: string[]): string | null {
  const t = segs(taskHref);
  let best: string | null = null, bestLen = 0;
  for (const h of linkHrefs) {
    const l = segs(h);
    if (!l.length || l.length > t.length) continue;
    if (l.every((x, i) => x === t[i]) && l.length > bestLen) { best = h; bestLen = l.length; }
  }
  // No full prefix (e.g. a task deep inside /instructor/courses/<id>/marks and a menu "Marks Entry" at /instructor/marks):
  // match on the first segment plus the last word of the task path.
  if (!best && t.length >= 2) {
    const last = t[t.length - 1];
    best = linkHrefs.find((h) => { const l = segs(h); return l[0] === t[0] && l[l.length - 1] === last; }) || null;
  }
  return best;
}

/** Status per menu link. `waiting` holds the task keys (title|href) the person marked as waiting on someone else. */
export function menuStatuses(tasks: MenuTask[], linkHrefs: string[], amberDays: number, waiting: Set<string> = new Set(), now = new Date()) {
  const out: Record<string, LinkStatus> = {};
  for (const t of tasks) {
    if (waiting.has(taskKey(t))) continue;
    const h = linkFor(t.href, linkHrefs);
    if (!h) continue;
    const s = statusOf(t, amberDays, now);
    const cur = out[h] || { status: s, count: 0, reasons: [] };
    cur.status = worst(cur.status, s)!;
    cur.count += 1;
    if (cur.reasons.length < 4) cur.reasons.push(t.title);
    out[h] = cur;
  }
  return out;
}
export const taskKey = (t: { title: string; href: string }) => `${t.title}|${t.href}`.slice(0, 180);

/** A group heading takes the worst status inside it. */
export function groupStatus(links: string[], statuses: Record<string, LinkStatus>): Status | null {
  return links.reduce<Status | null>((a, h) => worst(a, statuses[h]?.status || null), null);
}
