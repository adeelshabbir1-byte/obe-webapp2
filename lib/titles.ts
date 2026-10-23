import * as React from "react";
import { randomUUID } from "crypto";
import { prisma } from "./db";

// The institute's own name for each position — VC, Rector, Director or Principal instead of "Institute Head", Director of
// School instead of "Dean" — and whether the institute has the position at all. The chosen names replace the defaults in
// menus, page headings, notifications and printed documents (applyTitles). A position switched off passes its powers to
// the position above (lib/approvers.ts).

const tdb = prisma as unknown as Record<string, any>;
export const TITLES_HINT = "Position titles need prisma/migration_org_titles.sql — run it in Supabase.";

export type TitleKey = "INSTITUTE_HEAD" | "DEAN" | "HEAD_OF_DEPARTMENT" | "PROGRAM_LEAD" | "DEPARTMENT_COORDINATOR" | "EXAM_CONTROLLER" | "QEC_INCHARGE" | "OMC" | "COURSE_ASSIGNER" | "BATCH_ADVISOR";
export const TITLE_KEYS: { key: TitleKey; label: string; default: string; examples: string; canSwitchOff: boolean; roles: string[] }[] = [
  { key: "INSTITUTE_HEAD", label: "Head of the institute", default: "Institute Head", examples: "Vice Chancellor, Rector, Director, Principal, President", canSwitchOff: false, roles: ["CHAIRMAN"] },
  { key: "DEAN", label: "Head of a faculty / school", default: "Dean", examples: "Dean, Director of School", canSwitchOff: true, roles: ["DEAN"] },
  { key: "HEAD_OF_DEPARTMENT", label: "Head of a department", default: "Chairman", examples: "Chairman, Head of Department, Coordinator", canSwitchOff: true, roles: ["HEAD_OF_DEPARTMENT"] },
  { key: "PROGRAM_LEAD", label: "Person in charge of a program", default: "Program Lead", examples: "Program Coordinator, Program In-charge", canSwitchOff: false, roles: ["PROGRAM_COORDINATOR"] },
  { key: "DEPARTMENT_COORDINATOR", label: "Department's assistant to the program leads", default: "Program Coordinator", examples: "Department Coordinator, Academic Coordinator", canSwitchOff: true, roles: ["DEPARTMENT_COORDINATOR"] },
  { key: "EXAM_CONTROLLER", label: "Examinations", default: "Controller of Examinations", examples: "Controller of Examinations, Registrar (Exams)", canSwitchOff: true, roles: [] },
  { key: "QEC_INCHARGE", label: "Quality enhancement", default: "QEC In-charge", examples: "QEC In-charge, Director QEC, Quality Assurance Head", canSwitchOff: true, roles: [] },
  { key: "OMC", label: "Outcome committee", default: "OMC Member", examples: "OMC Member, OBE Committee Member", canSwitchOff: false, roles: ["OMC"] },
  { key: "COURSE_ASSIGNER", label: "Course allocation", default: "Course Assigner", examples: "Course Assigner, Timetable In-charge", canSwitchOff: false, roles: ["COURSE_ASSIGNER"] },
  { key: "BATCH_ADVISOR", label: "Batch mentor", default: "Batch Advisor", examples: "Batch Advisor, Class Mentor, Tutor", canSwitchOff: false, roles: [] },
];
export const DEFAULT_TITLE: Record<TitleKey, string> = Object.fromEntries(TITLE_KEYS.map((t) => [t.key, t.default])) as Record<TitleKey, string>;
export type Titles = Record<TitleKey, { title: string; enabled: boolean }>;
export const defaultTitles = (): Titles => Object.fromEntries(TITLE_KEYS.map((t) => [t.key, { title: t.default, enabled: true }])) as Titles;

/** The institute's titles (defaults where none is set). Memoised per request. */
// React's per-request memo inside Next; a plain function elsewhere (tests, scripts).
const cache: <T extends (...a: never[]) => unknown>(f: T) => T = (React as unknown as { cache?: <T>(f: T) => T }).cache || ((f) => f);
export const titlesFor = cache(async (chairmanId: string | null | undefined): Promise<Titles> => {
  const out = defaultTitles();
  if (!chairmanId) return out;
  try {
    const rows = (await tdb.instituteTitle.findMany({ where: { chairmanId } })) as { key: TitleKey; title: string; enabled: boolean }[];
    for (const r of rows) if (out[r.key]) out[r.key] = { title: r.title || out[r.key].title, enabled: r.enabled };
  } catch { /* table not there yet: defaults */ }
  return out;
});

export async function saveTitles(chairmanId: string, rows: { key: string; title: string; enabled: boolean }[], by: string) {
  for (const r of rows) {
    const def = TITLE_KEYS.find((t) => t.key === r.key);
    if (!def) continue;
    const title = (r.title || "").trim().slice(0, 60) || def.default;
    const enabled = def.canSwitchOff ? !!r.enabled : true;
    await tdb.instituteTitle.upsert({
      where: { chairmanId_key: { chairmanId, key: def.key } },
      create: { id: randomUUID(), chairmanId, key: def.key, title, enabled, updatedById: by, updatedAt: new Date() },
      update: { title, enabled, updatedById: by, updatedAt: new Date() },
    });
  }
}

const ROLE_KEY: Record<string, TitleKey> = { CHAIRMAN: "INSTITUTE_HEAD", DEAN: "DEAN", HEAD_OF_DEPARTMENT: "HEAD_OF_DEPARTMENT", PROGRAM_COORDINATOR: "PROGRAM_LEAD", PROGRAM_LEAD: "PROGRAM_LEAD", DEPARTMENT_COORDINATOR: "DEPARTMENT_COORDINATOR", OMC: "OMC", COURSE_ASSIGNER: "COURSE_ASSIGNER", EXAM_CONTROLLER: "EXAM_CONTROLLER", QEC_INCHARGE: "QEC_INCHARGE" };
/** The institute's name for a role (null when the role has no position title). */
export function roleTitle(role: string, t: Titles): string | null { const k = ROLE_KEY[role]; return k ? t[k].title : null; }
export const titleKeyOfRole = (role: string): TitleKey | null => ROLE_KEY[role] || null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Replaces the default position names in a text with the institute's own. Longest names first, whole words only, so
 * "Program Coordinator" is changed before "Coordinator" could be, and "Deanship" is left alone. */
export function applyTitles(text: string, t: Titles): string {
  if (!text) return text;
  const changes = TITLE_KEYS.filter((k) => t[k.key].title && t[k.key].title !== k.default).sort((a, b) => b.default.length - a.default.length);
  if (!changes.length) return text;
  // One pass over all names, so a new title that contains another default name is not replaced again.
  const re = new RegExp(`\\b(${changes.map((k) => esc(k.default)).join("|")})(s?)\\b`, "g");
  const by = new Map(changes.map((k) => [k.default, t[k.key].title]));
  return text.replace(re, (_m, name: string, plural: string) => `${by.get(name)}${plural}`);
}
