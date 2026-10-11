import { prisma } from "./db";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Senior Lecturer", "Lecturer", "Lab Engineer", "Visiting Faculty", "Other"];
export const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Visiting", "Part-time"];

export type Field = { key: "title" | "organisation" | "role" | "startYear" | "endYear" | "amount" | "status" | "link" | "details"; label: string; type?: "text" | "year" | "area" | "select"; options?: string[]; required?: boolean };
export type KindDef = { kind: string; tab: string; heading: string; addLabel: string; fields: Field[]; photo?: boolean };

export const KINDS: KindDef[] = [
  { kind: "EDUCATION", tab: "Education", heading: "Education and study", addLabel: "Add a degree", fields: [
    { key: "title", label: "Degree (e.g. PhD Computer Science)", required: true }, { key: "organisation", label: "University / institution" },
    { key: "role", label: "Field / specialization" }, { key: "startYear", label: "From year", type: "year" }, { key: "endYear", label: "To year", type: "year" },
    { key: "amount", label: "CGPA / division" }, { key: "status", label: "Status", type: "select", options: ["Completed", "In progress"] } ] },
  { kind: "EXPERIENCE", tab: "Experience", heading: "Work experience", addLabel: "Add a job", fields: [
    { key: "title", label: "Position", required: true }, { key: "organisation", label: "Organisation" },
    { key: "role", label: "Type", type: "select", options: ["Teaching", "Industry", "Research", "Administration", "Other"] },
    { key: "startYear", label: "From year", type: "year" }, { key: "endYear", label: "To year (blank = current)", type: "year" }, { key: "details", label: "What you did", type: "area" } ] },
  { kind: "PUBLICATION", tab: "Research papers", heading: "Research papers and publications", addLabel: "Add a paper", fields: [
    { key: "title", label: "Title of the paper", required: true }, { key: "organisation", label: "Journal / conference" },
    { key: "role", label: "Type", type: "select", options: ["Journal article", "Conference paper", "Book / chapter", "Patent", "Other"] },
    { key: "startYear", label: "Year", type: "year" }, { key: "status", label: "Status", type: "select", options: ["Published", "Accepted", "Under review"] },
    { key: "link", label: "Link / DOI" }, { key: "details", label: "Authors, indexing (Scopus, HEC category …)", type: "area" } ] },
  { kind: "GRANT", tab: "Grants", heading: "Grants and awards", addLabel: "Add a grant", fields: [
    { key: "title", label: "Grant / award title", required: true }, { key: "organisation", label: "Funding agency" },
    { key: "role", label: "Your role", type: "select", options: ["Principal investigator", "Co-investigator", "Member", "Recipient"] },
    { key: "amount", label: "Amount (e.g. PKR 2,000,000)" }, { key: "startYear", label: "From year", type: "year" }, { key: "endYear", label: "To year", type: "year" },
    { key: "status", label: "Status", type: "select", options: ["Won", "Ongoing", "Completed", "Applied"] }, { key: "details", label: "Notes", type: "area" } ] },
  { kind: "PROJECT", tab: "Projects", heading: "Projects you are working on", addLabel: "Add a project", fields: [
    { key: "title", label: "Project title", required: true }, { key: "organisation", label: "Sponsor / client" },
    { key: "role", label: "Your role" }, { key: "startYear", label: "From year", type: "year" }, { key: "endYear", label: "To year", type: "year" },
    { key: "status", label: "Status", type: "select", options: ["Ongoing", "Completed", "Planned"] }, { key: "details", label: "Description", type: "area" } ] },
  { kind: "EVENT", tab: "Events", heading: "Events you organised or took part in", addLabel: "Add an event", photo: true, fields: [
    { key: "title", label: "Event name", required: true }, { key: "organisation", label: "Venue / organisation" },
    { key: "role", label: "Your role", type: "select", options: ["Organiser", "Convener", "Speaker", "Participant", "Judge"] },
    { key: "startYear", label: "Year", type: "year" }, { key: "details", label: "About the event", type: "area" } ] },
];
export const KIND_NAMES = KINDS.map((k) => k.kind);

/** How complete a profile is: eight things every report relies on. */
export function completeness(p: { photo?: string | null; designation?: string | null; dateOfJoining?: Date | string | null; bloodGroup?: string | null; phone?: string | null; nextOfKinName?: string | null; nextOfKinPhone?: string | null } | null | undefined, educationCount: number) {
  const items = [!!p?.photo, !!p?.designation, !!p?.dateOfJoining, !!p?.bloodGroup, !!p?.phone, !!p?.nextOfKinName, !!p?.nextOfKinPhone, educationCount > 0];
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}

export function yearsOfService(joining: Date | string | null | undefined) {
  if (!joining) return null;
  const ms = Date.now() - new Date(joining).getTime();
  return ms < 0 ? 0 : Math.round((ms / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

/** A date as a fractional year, e.g. 1 July 2020 -> 2020.5 */
const fracYear = (d: Date) => d.getFullYear() + (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (365.25 * 24 * 3600 * 1000);
type Span = [number, number];
function mergedYears(spans: Span[]) {
  const s = spans.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, cur: Span | null = null;
  for (const sp of s) {
    if (!cur || sp[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [sp[0], sp[1]]; }
    else cur[1] = Math.max(cur[1], sp[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total * 10) / 10;
}

export const EXPERIENCE_HEADS = [
  { key: "institute", label: "At this institute" },
  { key: "teaching", label: "Teaching / academic (all places)" },
  { key: "industry", label: "Industry" },
  { key: "research", label: "Research" },
  { key: "administration", label: "Administration" },
  { key: "total", label: "Overall experience" },
] as const;
export type ExperienceSummary = Record<(typeof EXPERIENCE_HEADS)[number]["key"], number>;

/**
 * Years of experience worked out from the joining date and the "Work experience" entries (From year - To year; a blank
 * To year means still there). Overlapping periods are counted once, so two part-time jobs in the same years do not
 * double the total. Service at this institute (from the joining date) counts as teaching/academic experience too.
 */
export function experienceSummary(joining: Date | string | null | undefined, records: { kind: string; role?: string | null; startYear?: number | null; endYear?: number | null }[], now = new Date()): ExperienceSummary {
  const today = fracYear(now);
  const spans: Record<string, Span[]> = { teaching: [], industry: [], research: [], administration: [], other: [] };
  for (const r of records) {
    if (r.kind !== "EXPERIENCE" || !r.startYear) continue;
    const start = r.startYear;
    let end = r.endYear ? r.endYear : today;
    if (end <= start) end = start + 0.5; // a job that started and ended in the same year counts as half a year
    const type = (r.role || "").toLowerCase();
    const k = type.startsWith("teach") ? "teaching" : type.startsWith("indus") ? "industry" : type.startsWith("research") ? "research" : type.startsWith("admin") ? "administration" : "other";
    spans[k].push([start, Math.min(end, today)]);
  }
  const inst: Span[] = joining && !Number.isNaN(new Date(joining).getTime()) ? [[fracYear(new Date(joining)), today]] : [];
  const all = [...inst, ...Object.values(spans).flat()];
  return {
    institute: mergedYears(inst),
    teaching: mergedYears([...inst, ...spans.teaching]),
    industry: mergedYears(spans.industry),
    research: mergedYears(spans.research),
    administration: mergedYears(spans.administration),
    total: mergedYears(all),
  };
}
/** "4.5 yrs" or "—" */
export const yrsText = (n: number) => (n > 0 ? `${n} yr${n === 1 ? "" : "s"}` : "—");

type Viewer = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
export const REPORT_VIEWER_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const STAFF = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER", "LAB_MANAGER", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as const;

/** The staff this viewer may see in the faculty details report. */
export async function reportPeople(viewer: Viewer) {
  if (!REPORT_VIEWER_ROLES.includes(viewer.role)) return [];
  const chairmanId = viewer.role === "CHAIRMAN" ? viewer.id : viewer.managedById || "none";
  const institute = { OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], isVisitingPlaceholder: false, isActive: true, role: { in: STAFF as unknown as string[] } };
  let extra: Record<string, unknown> = {};
  if (viewer.role === "DEAN") extra = { OR: [{ department_: { facultyId: viewer.facultyId || "none" } }, { managedBy: { department_: { facultyId: viewer.facultyId || "none" } } }] };
  else if (viewer.role === "HEAD_OF_DEPARTMENT" || viewer.role === "DEPARTMENT_COORDINATOR") extra = { OR: [{ departmentId: viewer.departmentId || "none" }, { managedBy: { departmentId: viewer.departmentId || "none" } }] };
  else if (viewer.role === "PROGRAM_COORDINATOR") extra = { OR: [{ managedById: viewer.id }, { id: viewer.id }] };
  const people = await prisma.user.findMany({
    where: { AND: [institute as never, extra as never] } as never,
    select: { id: true, name: true, email: true, role: true, secondaryRole: true, departmentId: true, specialization: true, leadProgram: true, department_: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return people as { id: string; name: string; email: string; role: string; secondaryRole: string | null; departmentId: string | null; specialization: string | null; leadProgram: string | null; department_: { name: string } | null }[];
}
