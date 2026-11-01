import { prisma } from "./db";
import { allStored } from "./scopedSettings";

// "Who decides what" (Adeel prompt §15): one registry of every setting, its current value, who sets it, who set it last and
// where it is changed. Each new setting added in a build is registered here. Two kinds:
//  - "scoped": stored in ScopedSetting (institute / department / program values, lib/scopedSettings.ts), editable on the page;
//  - "model": an existing settings table (one row per institute) — shown with its values and a link to its own page.

const db = prisma as unknown as Record<string, any>;
export type Who = "Super Admin" | "Institute Head" | "OMC (department)" | "Program Lead (program)" | "Controller" | "IT Manager" | "HOD" | "Department Coordinator" | "Each person";
export type SettingDef = {
  key: string; label: string; area: string; who: Who[]; href: string; help?: string;
  kind: "scoped"; def: string; unit?: string; min?: number; max?: number;
} | {
  key: string; label: string; area: string; who: Who[]; href: string; help?: string;
  kind: "model"; model: string; fields: [string, string][]; where?: "chairmanId";
};

export const SETTINGS: SettingDef[] = [
  { kind: "scoped", key: "msg.monthlyCap", label: "SMS / WhatsApp messages per month (0 = no cap)", area: "Messages", who: ["Institute Head"], href: "/settings/who-decides", def: "0", unit: "messages", min: 0, max: 1000000 },
  { kind: "scoped", key: "feedback.midWeek", label: "Mid-semester feedback opens in week", area: "Quality", who: ["OMC (department)", "Program Lead (program)"], href: "/settings/who-decides", def: "6", unit: "", min: 3, max: 12, help: "A 2-minute survey per course opens in this week and stays open 14 days. Results show the teacher after 5 responses." },
  { kind: "scoped", key: "ga.rule", label: "GA attainment rule (0 = average, 1 = count)", area: "Outcomes", who: ["OMC (department)", "Program Lead (program)"], href: "/settings/who-decides", def: "0", min: 0, max: 1, help: "0: the credit-weighted average across the student's courses for a GA must reach the pass mark (default). 1: the GA must be attained in at least N courses." },
  { kind: "scoped", key: "ga.countN", label: "Courses needed under the count rule", area: "Outcomes", who: ["OMC (department)", "Program Lead (program)"], href: "/settings/who-decides", def: "3", unit: "courses", min: 1, max: 20 },
  { kind: "scoped", key: "se.maxCourses", label: "Most SE courses per person", area: "Curriculum", who: ["OMC (department)", "Program Lead (program)"], href: "/settings/who-decides", def: "3", unit: "courses", min: 1, max: 20, help: "Base courses one teacher may be Subject Expert of. At the limit the count turns amber; going over needs a reason." },
  { kind: "scoped", key: "menu.amberDays", label: "Amber window for deadlines", area: "Menus & reminders", who: ["OMC (department)", "Program Lead (program)"], href: "/settings/who-decides", def: "3", unit: "working days", min: 1, max: 15, help: "How many working days before a deadline a menu item turns amber. The Program Lead's value for his program is final." },
  { kind: "model", key: "academicRules", label: "Academic standing and exam attendance", area: "Examinations", who: ["Controller"], href: "/academic-rules", model: "academicRule", fields: [["warningCgpa", "Warning CGPA"], ["probationCgpa", "Probation CGPA"], ["holdCgpa", "Registration hold CGPA"], ["dismissCgpa", "Dismissal CGPA"], ["minAttendanceForExam", "Min attendance for exam %"]] },
  { kind: "model", key: "statusPolicy", label: "Transfers, drops and exits", area: "Examinations", who: ["Controller", "Institute Head"], href: "/status-changes", model: "studentStatusPolicy", fields: [["transferMinGrade", "Min grade to transfer"], ["transferMaxPct", "Max % of credits transferred"], ["dropDeadlineWeek", "Drop deadline (week)"], ["readOnlyDays", "Portal read-only days after leaving"]] },
  { kind: "model", key: "feedback", label: "Mid-semester and course feedback window", area: "Quality", who: ["Institute Head"], href: "/coordinator/surveys", model: "feedbackSettings", fields: [["fromWeek", "From week"], ["toWeek", "To week"], ["minResponses", "Min responses before results show"]] },
  { kind: "model", key: "topicPlan", label: "Topic Workspace reminders and limits", area: "Curriculum", who: ["Institute Head"], href: "/faculty/topic-workspace", model: "topicPlanSetting", fields: [["remindDays", "Remind after (days)"], ["escalateDays", "Escalate after (days)"], ["minBankQuestions", "Min question-bank questions"], ["minSection", "Min section size"]] },
  { kind: "model", key: "plan", label: "Extra classes in a plan", area: "Curriculum", who: ["Institute Head"], href: "/chairman/institute-settings", model: "planSetting", fields: [["minExtraClass", "Min extra classes"]] },
  { kind: "model", key: "timetable", label: "Timetable section size", area: "Timetable", who: ["Department Coordinator"], href: "/coordinator/timetable", model: "timetableSetting", fields: [["scopeKey", "Scope"], ["maxSection", "Max students per section"]] },
  { kind: "model", key: "messaging", label: "SMS and WhatsApp providers", area: "Messages", who: ["IT Manager"], href: "/chairman/messaging", model: "messagingConfig", fields: [["smsProvider", "SMS provider"], ["waProvider", "WhatsApp provider"], ["dailyLimit", "Daily message limit"]] },
  { kind: "model", key: "ai", label: "AI key and use", area: "AI", who: ["Institute Head"], href: "/chairman/ai-configuration", model: "aiConfig", fields: [["provider", "Provider"], ["model", "Model"], ["enabled", "On"], ["chatbotEnabled", "Help chatbot on"], ["chatbotDailyLimit", "Chatbot daily limit"]] },
  { kind: "model", key: "lms", label: "Moodle link", area: "Teaching", who: ["IT Manager"], href: "/chairman/lms", model: "lmsConfig", fields: [["moodleUrl", "Moodle address"]] },
  { kind: "model", key: "finance", label: "Fee dues and blocks", area: "Finance", who: ["Institute Head"], href: "/chairman/finance", model: "financeSetting", fields: [["blockAdmitCard", "Block admit card"], ["blockRegistration", "Block registration"], ["blockDegree", "Block degree"], ["minDue", "Minimum due"]] },
  { kind: "model", key: "privacy", label: "Data retention", area: "Privacy", who: ["Institute Head"], href: "/privacy", model: "privacySetting", fields: [["inactiveUserMonths", "Deactivate unused accounts after (months)"], ["graduatedDetailYears", "Keep graduates' details (years)"]] },
  { kind: "model", key: "helpDesk", label: "Help desk response times", area: "Help", who: ["Institute Head"], href: "/help/manage", model: "helpDeskSetting", fields: [["slaHoursJson", "Hours to first answer"]] },
  { kind: "model", key: "approvals", label: "Approval reminders and escalation", area: "Approvals", who: ["Institute Head"], href: "/approvals", model: "approvalSetting", fields: [["kind", "Kind"], ["remindAfterDays", "Remind after (days)"], ["escalateAfterDays", "Escalate after (days)"]] },
  { kind: "model", key: "assessmentLimits", label: "Assessment limits per course category", area: "Curriculum", who: ["OMC (department)"], href: "/omc/weight-policy", model: "assessmentLimit", fields: [["category", "Category"], ["figuresJson", "Limits"], ["locked", "Locked"]] },
];

type Row = { label: string; area: string; who: string; href: string; help?: string; key: string; editable: boolean; unit?: string; min?: number; max?: number;
  values: { scope: string; value: string; by: string | null; at: Date | null }[] };

const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v).slice(0, 80));

/** Every registered setting with its stored values for one institute (department / program values named). */
export async function settingsOverview(chairmanId: string): Promise<Row[]> {
  const stored = await allStored(chairmanId);
  const [depts, pls] = await Promise.all([
    prisma.department.findMany({ where: { id: { in: stored.filter((s) => s.scopeType === "DEPARTMENT").map((s) => s.scopeId).concat("none") } }, select: { id: true, name: true } }).catch(() => []),
    prisma.user.findMany({ where: { id: { in: stored.filter((s) => s.scopeType === "PROGRAM").map((s) => s.scopeId).concat("none") } }, select: { id: true, name: true } }).catch(() => []),
  ]);
  const names = new Map<string, string>([...depts.map((d) => [d.id, `Department: ${d.name}`] as [string, string]), ...pls.map((p) => [p.id, `Program of ${p.name}`] as [string, string])]);
  const out: Row[] = [];
  const byIds = new Set<string>();
  for (const s of SETTINGS) {
    const base = { label: s.label, area: s.area, who: s.who.join(" · "), href: s.href, help: s.help, key: s.key };
    if (s.kind === "scoped") {
      const mine = stored.filter((x) => x.key === s.key);
      mine.forEach((m) => m.updatedById && byIds.add(m.updatedById));
      const inst = mine.find((m) => m.scopeType === "INSTITUTE");
      out.push({ ...base, editable: true, unit: s.unit, min: s.min, max: s.max, values: [
        { scope: inst ? "Institute" : "Built-in default", value: inst ? inst.value : s.def, by: inst?.updatedById || null, at: inst?.updatedAt || null },
        ...mine.filter((m) => m.scopeType !== "INSTITUTE").map((m) => ({ scope: names.get(m.scopeId) || m.scopeType, value: m.value, by: m.updatedById, at: m.updatedAt })),
      ] });
    } else {
      const rows = ((await db[s.model]?.findMany({ where: { chairmanId }, take: 10 }).catch(() => [])) || []) as Record<string, unknown>[];
      rows.forEach((r) => typeof r.updatedById === "string" && byIds.add(r.updatedById));
      out.push({ ...base, editable: false, values: rows.length ? rows.map((r) => ({ scope: "Institute", value: s.fields.map(([f, l]) => `${l}: ${fmt(r[f])}`).join(" · "), by: (r.updatedById as string) || null, at: (r.updatedAt as Date) || null })) : [{ scope: "Built-in default", value: "Not set yet — defaults apply", by: null, at: null }] });
    }
  }
  const who = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(byIds).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  for (const r of out) for (const v of r.values) v.by = v.by ? who.get(v.by) || "someone" : null;
  return out;
}
export const scopedDef = (key: string) => SETTINGS.find((s) => s.key === key && s.kind === "scoped") as Extract<SettingDef, { kind: "scoped" }> | undefined;
