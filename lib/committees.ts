import { rdb, type Who } from "./registers";

// Committees HEC's policies require, with what each policy asks of them. Cases are confidential: only the committee's
// members and the institute head see them; everyone else sees counts.

export const COM_HINT = "Committees need prisma/migration_committees.sql — run it in Supabase.";
export const KINDS: Record<string, { label: string; policy: string; minMembers: number; needsWoman: boolean; daysToDecide: number | null; categories: string[] }> = {
  HARASSMENT: { label: "Inquiry committee on harassment", policy: "HEC Policy on Protection against Sexual Harassment in Higher Education Institutions (2020)", minMembers: 3, needsWoman: true, daysToDecide: 30, categories: ["Verbal", "Physical", "Online / electronic", "Quid pro quo", "Other"] },
  GRIEVANCE: { label: "Student grievance committee", policy: "Institute's student grievance policy", minMembers: 3, needsWoman: false, daysToDecide: 30, categories: ["Academic", "Examination", "Administrative", "Fee", "Hostel / facilities", "Other"] },
  DISABILITY: { label: "Disability focal person / committee", policy: "HEC Policy for Students with Disabilities at Higher Education Institutions (2021)", minMembers: 1, needsWoman: false, daysToDecide: 15, categories: ["Accommodation request", "Accessibility complaint", "Other"] },
  DISCIPLINE: { label: "Discipline committee", policy: "Institute's student conduct rules", minMembers: 3, needsWoman: false, daysToDecide: 30, categories: ["Misconduct", "Unfair means", "Other"] },
  OTHER: { label: "Other committee", policy: "", minMembers: 1, needsWoman: false, daysToDecide: null, categories: ["Other"] },
};
export const ROLES: Record<string, string> = { CHAIR: "Convener / chair", SECRETARY: "Secretary", MEMBER: "Member", EXTERNAL: "External member", FOCAL: "Focal person" };
export const STATUSES: Record<string, string> = { RECEIVED: "Received", INQUIRY: "Under inquiry", DECIDED: "Decided", CLOSED: "Closed", APPEAL: "Under appeal" };
export type Committee = { id: string; chairmanId: string; kind: string; name: string; policyRef: string | null; termStart: Date | null; termEnd: Date | null };
export type Member = { id: string; committeeId: string; userId: string | null; name: string; role: string; gender: string | null; organisation: string | null; fromDate: Date | null; toDate: Date | null };
export type Case = { id: string; committeeId: string; caseNo: string; receivedAt: Date; category: string; status: string; outcome: string | null; notes: string | null; closedAt: Date | null };
export const canManageCommittees = (w: Who) => w.head || w.dean || w.qec;

/** Whether the committee meets its policy: enough members, a woman member where required, a term that has not lapsed. */
export function compliance(c: Committee, members: Member[], now = new Date()) {
  const k = KINDS[c.kind] || KINDS.OTHER;
  const current = members.filter((m) => !m.toDate || new Date(m.toDate) >= now);
  const issues: string[] = [];
  if (current.length < k.minMembers) issues.push(`needs at least ${k.minMembers} member(s), has ${current.length}`);
  if (k.needsWoman && !current.some((m) => /^f/i.test(m.gender || ""))) issues.push("needs at least one woman member");
  if (k.minMembers > 1 && !current.some((m) => m.role === "CHAIR")) issues.push("no convener / chair named");
  if (c.termEnd && new Date(c.termEnd) < now) issues.push(`term ended ${new Date(c.termEnd).toLocaleDateString("en-GB")} — reconstitute it`);
  return { ok: !issues.length, issues, current };
}
export function overdue(c: Committee, cs: Case, now = new Date()) {
  const d = (KINDS[c.kind] || KINDS.OTHER).daysToDecide;
  return !!d && !["DECIDED", "CLOSED"].includes(cs.status) && (now.getTime() - new Date(cs.receivedAt).getTime()) / 864e5 > d;
}
export async function canSeeCases(w: Who, committeeId: string) {
  if (w.head) return true;
  return !!(await rdb.committeeMember.findFirst({ where: { committeeId, userId: w.id } }).catch(() => null));
}

/** The year's report: members, meetings, and cases by category and status, without names. */
export function annual(c: Committee, members: Member[], meetings: { date: Date }[], cases: Case[], year: number) {
  const inYear = (d: Date | null) => !!d && new Date(d).getFullYear() === year;
  const received = cases.filter((x) => inYear(x.receivedAt)), closed = cases.filter((x) => inYear(x.closedAt));
  const byCat = new Map<string, number>(); for (const x of received) byCat.set(x.category, (byCat.get(x.category) || 0) + 1);
  const days = closed.map((x) => (new Date(x.closedAt!).getTime() - new Date(x.receivedAt).getTime()) / 864e5);
  return { year, members, meetings: meetings.filter((m) => inYear(m.date)), received: received.length, closed: closed.length, open: cases.filter((x) => !["CLOSED", "DECIDED"].includes(x.status)).length, byCategory: Array.from(byCat.entries()), avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null, overdue: cases.filter((x) => overdue(c, x)).length };
}
