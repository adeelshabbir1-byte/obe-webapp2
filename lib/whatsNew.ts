// "What's new" (Adeel prompt §14): each build adds its entries here, newest first. `roles` are the role keys that see it
// ("*" = every staff role). The notice shows a person only the entries for their role(s) that are newer than the last one
// they dismissed (UserFlag "whatsnew"). The full list is on /whats-new.
export type WhatsNew = { id: string; date: string; roles: string[]; text: string; href?: string };

const STAFF = "*";
export const WHATS_NEW: WhatsNew[] = [
  { id: "2026-11-01-a", date: "2026-11-01", roles: [STAFF], text: "Menu colours: each page in your menu shows red (overdue), amber (due soon) or blue (in progress), with a count. Hover for the reason.", href: "/dashboard#whats-next" },
  { id: "2026-11-01-b", date: "2026-11-01", roles: [STAFF], text: "“My week” on your home page, “Waiting…” to park a task you can't act on yet, and a daily or weekly digest of red and amber items.", href: "/dashboard#my-week" },
  { id: "2026-11-01-c", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"], text: "“Who decides what”: one page with every setting, its value, who sets it, who changed it last and where to change it.", href: "/settings/who-decides" },
  { id: "2026-11-01-d", date: "2026-11-01", roles: ["CHAIRMAN", "SUPER_USER"], text: "Pages without help are now listed as missing answers, so you can see where help is still to be written.", href: "/help/manage" },
];

export function entriesFor(role: string, extraRoles: string[] = []) {
  const mine = new Set([role, ...extraRoles]);
  return WHATS_NEW.filter((e) => e.roles.includes(STAFF) ? role !== "STUDENT" : e.roles.some((r) => mine.has(r)));
}
/** Entries newer than the last one the person dismissed. */
export function unseen(role: string, extraRoles: string[], lastSeenId: string | null) {
  const list = entriesFor(role, extraRoles);
  if (!lastSeenId) return list.slice(0, 5);
  const seenAt = WHATS_NEW.findIndex((e) => e.id === lastSeenId);
  return seenAt < 0 ? list.slice(0, 5) : list.filter((e) => WHATS_NEW.indexOf(e) < seenAt);
}
