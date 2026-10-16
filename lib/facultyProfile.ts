import { prisma } from "./db";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Senior Lecturer", "Lecturer", "Lab Engineer", "Visiting Faculty", "Other"];
export const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Adjunct", "Visiting", "Part-time"];
// How accreditation (NBEAC / HEC) counts a publication.
export const PUBLICATION_CATEGORIES = ["Impact factor journal", "HEC W category", "HEC X category", "HEC Y category", "Other listing", "Not applicable"];

export type Field = { key: "title" | "organisation" | "role" | "startMonth" | "startYear" | "endMonth" | "endYear" | "amount" | "status" | "link" | "details" | "category" | "authorship" | "citations"; label: string; type?: "text" | "year" | "month" | "area" | "select"; options?: string[]; required?: boolean };
export type KindDef = { kind: string; tab: string; heading: string; addLabel: string; fields: Field[]; photo?: boolean };

export const KINDS: KindDef[] = [
  { kind: "EDUCATION", tab: "Education", heading: "Education and study", addLabel: "Add a degree", fields: [
    { key: "title", label: "Degree (e.g. PhD Computer Science)", required: true }, { key: "organisation", label: "University / institution" },
    { key: "role", label: "Field / specialization" }, { key: "startYear", label: "From year", type: "year" }, { key: "endYear", label: "To year", type: "year" },
    { key: "amount", label: "CGPA / division" }, { key: "status", label: "Status", type: "select", options: ["Completed", "In progress"] } ] },
  { kind: "EXPERIENCE", tab: "Experience", heading: "Work experience", addLabel: "Add a job", fields: [
    { key: "title", label: "Position", required: true }, { key: "organisation", label: "Organisation" },
    { key: "role", label: "Type", type: "select", options: ["Teaching", "Industry", "Research", "Administration", "Other"] },
    { key: "startMonth", label: "From month", type: "month" }, { key: "startYear", label: "From year", type: "year" },
    { key: "endMonth", label: "To month", type: "month" }, { key: "endYear", label: "To year (blank = still working here)", type: "year" }, { key: "details", label: "What you did", type: "area" } ] },
  { kind: "PUBLICATION", tab: "Research papers", heading: "Research papers and publications", addLabel: "Add a paper", fields: [
    { key: "title", label: "Title of the paper", required: true }, { key: "organisation", label: "Journal / conference" },
    { key: "role", label: "Type", type: "select", options: ["Journal article", "Conference paper", "Book / chapter", "Patent", "Other"] },
    { key: "startYear", label: "Year", type: "year" }, { key: "status", label: "Status", type: "select", options: ["Published", "Accepted", "Under review"] },
    { key: "category", label: "Journal category (HEC / impact factor)", type: "select", options: PUBLICATION_CATEGORIES },
    { key: "authorship", label: "You are", type: "select", options: ["First author", "Co-author"] }, { key: "citations", label: "Citations so far" },
    { key: "link", label: "Link / DOI" }, { key: "details", label: "Authors, indexing (Scopus …)", type: "area" } ] },
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
  return Math.round(total * 100) / 100;
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
export function experienceSummary(joining: Date | string | null | undefined, records: { kind: string; role?: string | null; startYear?: number | null; startMonth?: number | null; endYear?: number | null; endMonth?: number | null }[], now = new Date()): ExperienceSummary {
  const today = fracYear(now);
  const spans: Record<string, Span[]> = { teaching: [], industry: [], research: [], administration: [], other: [] };
  for (const r of records) {
    if (r.kind !== "EXPERIENCE" || !r.startYear) continue;
    // From the first day of the start month to the last day of the end month (Jan 2015 - Dec 2017 = 3 years).
    // Without a month: start of the start year; end year counted as in "2015-2018 = 3 years".
    const m = (v: number | null | undefined) => (v && v >= 1 && v <= 12 ? v : null);
    const sm = (r as { startMonth?: number | null }).startMonth, em = (r as { endMonth?: number | null }).endMonth;
    const start = r.startYear + ((m(sm) || 1) - 1) / 12;
    let end = r.endYear ? r.endYear + (m(em) ? m(em)! / 12 : 0) : today;
    if (end <= start) end = m(sm) || m(em) ? start + 1 / 12 : start + 0.5; // same-year job with no months: half a year
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
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2015 – Jun 2018", "2015 – present" … for a record's dates. */
export function periodText(r: { kind?: string; startYear?: number | null; startMonth?: number | null; endYear?: number | null; endMonth?: number | null }) {
  if (!r.startYear) return null;
  const one = (y: number, mo?: number | null) => `${mo && mo >= 1 && mo <= 12 ? MONTHS[mo - 1] + " " : ""}${y}`;
  const end = r.endYear ? one(r.endYear, r.endMonth) : r.kind === "EXPERIENCE" ? "present" : "";
  return `${one(r.startYear, r.startMonth)}${end ? ` – ${end}` : ""}`;
}
/** 6.83 -> "6 y 10 m"; 0 -> "—" */
export function ymText(years: number) {
  const months = Math.round(years * 12);
  if (months <= 0) return "—";
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} y` : "", m ? `${m} m` : ""].filter(Boolean).join(" ");
}
/** "4.5 yrs" or "—" */
export const yrsText = (n: number) => (n > 0 ? `${n} yr${n === 1 ? "" : "s"}` : "—");

type Viewer = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
export const REPORT_VIEWER_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const STAFF = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER", "LAB_MANAGER", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as const;

/** The staff this viewer may see in the faculty details report. */
export type ReportPerson = { id: string; name: string; email: string; role: string; secondaryRole: string | null; departmentId: string | null; specialization: string | null; leadProgram: string | null; department_: { name: string } | null };
export async function reportPeople(viewer: Viewer): Promise<ReportPerson[]> {
  if (!REPORT_VIEWER_ROLES.includes(viewer.role)) return [];
  const chairmanId = viewer.role === "CHAIRMAN" ? viewer.id : viewer.managedById || "none";
  const institute = { OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], isVisitingPlaceholder: false, isActive: true, role: { in: STAFF as unknown as string[] } };
  let extra: Record<string, unknown> = {};
  if (viewer.role === "DEAN") extra = { OR: [{ department_: { facultyId: viewer.facultyId || "none" } }, { managedBy: { department_: { facultyId: viewer.facultyId || "none" } } }] };
  else if (viewer.role === "HEAD_OF_DEPARTMENT" || viewer.role === "DEPARTMENT_COORDINATOR") extra = { OR: [{ departmentId: viewer.departmentId || "none" }, { managedBy: { departmentId: viewer.departmentId || "none" } }] };
  else if (viewer.role === "PROGRAM_COORDINATOR") extra = { OR: [{ managedById: viewer.id }, { id: viewer.id }] };
  const people = await prisma.user.findMany({
    where: { AND: [institute as never, extra as never] } as never,
    select: { id: true, name: true, email: true, role: true, secondaryRole: true, departmentId: true, specialization: true, leadProgram: true, department_: { select: { name: true } }, managedBy: { select: { departmentId: true, department_: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });
  // A teacher added under a Program Lead often has no department of their own: they belong to the lead's department.
  return (people as unknown as (Omit<ReportPerson, "department_"> & { department_: { name: string } | null; managedBy: { departmentId: string | null; department_: { name: string } | null } | null })[]).map(({ managedBy, ...p }) => ({
    ...p,
    departmentId: p.departmentId || managedBy?.departmentId || null,
    department_: p.department_ || managedBy?.department_ || null,
  })) as ReportPerson[];
}
