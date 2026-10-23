import { randomUUID } from "crypto";
import { prisma } from "./db";
import { whoIs } from "./registers";
import { coordinatorIdsFor, canViewReports } from "./reportScope";
import { GLOSSARY } from "./glossary";

// Search everywhere. Each kind of record is searched only within what the person may see on the pages themselves:
// students of their programs / courses / advisees (the whole institute for the Institute Head, Controller of
// Examinations, QEC, OMC, finance and student affairs), staff of their institute, courses and batches of their
// programs, meetings, policies, SAR records and evidence of their institute. Students search their own courses and
// the help pages. ILIKE searches use the trigram indexes from migration_search.sql when they are there.

const sdb = prisma as unknown as Record<string, any>;
export type Hit = { title: string; sub: string; href: string };
export type Group = { type: string; label: string; items: Hit[] };
export type Viewer = { kind: "staff"; user: { id: string; name: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null; extraRoles?: string[] | null } } | { kind: "student"; student: { id: string; name: string; batchId: string } };

const LIMIT = 6;
const g = async <T,>(f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch { return []; } };
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/** The batches whose students (and courses) this member of staff may see. null = every batch of the institute. */
async function staffScope(u: Extract<Viewer, { kind: "staff" }>["user"], chairmanId: string, wide: boolean) {
  if (wide) return { batchIds: null as string[] | null, courseIds: null as string[] | null };
  const leads = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "DEAN", "HEAD_OF_DEPARTMENT"].includes(u.role) ? await coordinatorIdsFor(u as never).catch(() => [] as string[]) : [];
  const [byLead, advised, taught] = await Promise.all([
    leads.length ? prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, select: { id: true } }) : Promise.resolve([] as { id: string }[]),
    prisma.batch.findMany({ where: { advisorId: u.id, coordinator: { managedById: chairmanId } }, select: { id: true } }),
    prisma.course.findMany({ where: { OR: [{ instructorId: u.id }, { subjectExpertId: u.id }] }, select: { id: true, batchId: true } }),
  ]);
  return { batchIds: Array.from(new Set([...byLead, ...advised].map((b) => b.id))), courseIds: taught.map((c) => c.id), advised: new Set(advised.map((b) => b.id)), taughtBatches: taught.map((c) => c.batchId).filter((x): x is string => !!x) };
}

export async function search(v: Viewer, raw: string): Promise<{ groups: Group[]; suggestions: string[] }> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return { groups: [], suggestions: [] };
  const groups: Group[] = [];
  const push = (type: string, label: string, items: Hit[]) => { if (items.length) groups.push({ type, label, items: items.slice(0, LIMIT) }); };

  if (v.kind === "student") {
    const courses = await g(() => prisma.studentEnrollment.findMany({ where: { studentId: v.student.id, course: { OR: [{ code: ci(q) }, { title: ci(q) }] } }, select: { course: { select: { id: true, code: true, title: true } } }, take: LIMIT }));
    push("course", "My courses", courses.map((c) => ({ title: `${c.course.code} ${c.course.title}`, sub: "Course", href: "/student/dashboard" })));
    push("help", "Help", await helpHits(q, null, true));
    return { groups, suggestions: groups.length ? [] : await closest(q, null, null) };
  }

  const u = v.user;
  const w = await whoIs(u as never);
  if (!w) return { groups: [], suggestions: [] };
  const H = w.chairmanId;
  const wide = w.head || w.exam || w.qec || w.finance || w.affairs || u.role === "OMC" || (u.role === "DEAN" && !u.facultyId);
  const sc = await staffScope(u, H, wide);
  const batchWhere = sc.batchIds ? { id: { in: sc.batchIds.concat(["none"]) } } : { coordinator: { managedById: H } };
  const reports = canViewReports(u.role);

  // Students: name, roll number, or the last digits of the CNIC.
  const digits = q.replace(/\D/g, "");
  const studentWhere = sc.batchIds || !sc.courseIds ? { batch: batchWhere } : {};
  const taughtStudentIds = sc.courseIds?.length ? (await g(() => prisma.studentEnrollment.findMany({ where: { courseId: { in: sc.courseIds! } }, select: { studentId: true } }))).map((e) => e.studentId) : [];
  const scopeOr = [studentWhere, ...(taughtStudentIds.length ? [{ id: { in: taughtStudentIds } }] : [])];
  let students = await g(() => prisma.student.findMany({ where: { AND: [{ OR: scopeOr as never }, { OR: [{ name: ci(q) }, { rollNumber: ci(q) }] }] }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true, coordinatorId: true } } }, take: LIMIT }));
  if (digits.length >= 4 && students.length < LIMIT) {
    const details = await g(() => sdb.studentDetail.findMany({ where: { dataJson: { contains: digits.slice(-4) } }, select: { studentId: true, dataJson: true }, take: 300 }) as Promise<{ studentId: string; dataJson: string }[]>);
    const ids = details.filter((d) => { try { return String((JSON.parse(d.dataJson) as Record<string, unknown>).cnic || "").replace(/\D/g, "").endsWith(digits); } catch { return false; } }).map((d) => d.studentId);
    if (ids.length) students = students.concat(await g(() => prisma.student.findMany({ where: { AND: [{ OR: scopeOr as never }, { id: { in: ids } }] }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true, coordinatorId: true } } }, take: LIMIT })));
  }
  const studentHref = (s: (typeof students)[number]) => s.batch.coordinatorId === u.id ? `/coordinator/student-transcript?studentId=${s.id}` : sc.advised?.has(s.batchId) ? `/advisor/students/${s.id}` : reports ? `/omc/reports/student-transcript?studentId=${s.id}` : w.head || w.exam ? `/official-transcript?studentId=${s.id}` : `/status-changes?q=${encodeURIComponent(s.rollNumber)}`;
  push("student", "Students", Array.from(new Map(students.map((s) => [s.id, s])).values()).map((s) => ({ title: `${s.name} · ${s.rollNumber}`, sub: `${s.batch.degreeProgram} ${s.batch.batchName}`, href: studentHref(s) })));

  // Staff of the institute.
  const staff = await g(() => prisma.user.findMany({ where: { isActive: true, name: ci(q), OR: [{ id: H }, { managedById: H }, { managedBy: { managedById: H } }] }, select: { id: true, name: true, role: true, department_: { select: { name: true } } }, take: LIMIT }));
  const staffHref = (name: string) => (w.head ? `/chairman/people?q=${encodeURIComponent(name)}` : w.dean ? "/dean/overview" : w.hod ? "/hod/department" : w.lead ? "/coordinator/faculty" : u.role === "OMC" ? "/omc/instructor-review" : null);
  if (staffHref("")) push("staff", "Staff", staff.map((s) => ({ title: s.name, sub: [s.role.replace(/_/g, " ").toLowerCase(), s.department_?.name].filter(Boolean).join(" · "), href: staffHref(s.name) as string })));

  // Courses and batches of the programs in scope (the courses they teach for teachers).
  const courseWhere = sc.batchIds ? { OR: [{ batchId: { in: sc.batchIds.concat(["none"]) } }, ...(sc.courseIds?.length ? [{ id: { in: sc.courseIds } }] : [])] } : sc.courseIds && !wide ? { id: { in: sc.courseIds.concat(["none"]) } } : { coordinator: { managedById: H } };
  const courses = await g(() => prisma.course.findMany({ where: { AND: [courseWhere as never, { OR: [{ code: ci(q) }, { title: ci(q) }] }] }, select: { id: true, code: true, title: true, instructorId: true, coordinatorId: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" }, take: LIMIT }));
  push("course", "Courses", courses.map((c) => ({ title: `${c.code} ${c.title}`, sub: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`.trim(), href: c.instructorId === u.id ? `/instructor/courses/${c.id}` : c.coordinatorId === u.id ? `/coordinator/courses?courseId=${c.id}` : `/api/course-file?courseId=${c.id}` })));
  const batches = await g(() => prisma.batch.findMany({ where: { AND: [batchWhere as never, { OR: [{ batchName: ci(q) }, { degreeProgram: ci(q) }] }] }, select: { id: true, batchName: true, degreeProgram: true, coordinatorId: true }, take: LIMIT }));
  push("batch", "Batches and programs", batches.map((b) => ({ title: `${b.degreeProgram} — ${b.batchName}`, sub: "Batch", href: b.coordinatorId === u.id ? `/coordinator/batches?batchId=${b.id}` : `/student-movement` })));

  // Meetings, policies, SAR / accreditation records and evidence files of the institute (staff who use those pages).
  if (w.leader || w.qec || w.lead || u.role === "OMC" || w.exam) {
    const meetings = await g(() => prisma.meetingMinutes.findMany({ where: { chairmanId: H, OR: [{ title: ci(q) }, { decisions: ci(q) }] }, select: { id: true, title: true, kind: true, meetingDate: true }, orderBy: { meetingDate: "desc" }, take: LIMIT }));
    push("meeting", "Meetings", meetings.map((m) => ({ title: m.title, sub: `${m.kind} meeting · ${new Date(m.meetingDate).toLocaleDateString("en-GB")}`, href: `/meetings?id=${m.id}` })));
    const policies = await g(() => sdb.policyDoc.findMany({ where: { chairmanId: H, title: ci(q) }, select: { id: true, title: true, kind: true }, take: LIMIT }) as Promise<{ id: string; title: string; kind: string }[]>);
    push("policy", "Policies and manuals", policies.map((p) => ({ title: p.title, sub: p.kind.toLowerCase(), href: `/policy-history?id=${p.id}` })));
    const cycles = await g(() => sdb.accreditationCycle.findMany({ where: { chairmanId: H, OR: [{ program: ci(q) }, { title: ci(q) }, { body: ci(q) }] }, select: { id: true, title: true, program: true, body: true }, take: LIMIT }) as Promise<{ id: string; title: string; program: string; body: string }[]>);
    push("sar", "SAR and accreditation", cycles.map((c) => ({ title: c.title, sub: `${c.body} · ${c.program}`, href: `/accreditation/sar/${c.id}` })));
    const files = await g(() => sdb.evidenceFile.findMany({ where: { chairmanId: H, OR: [{ title: ci(q) }, { fileName: ci(q) }, { note: ci(q) }] }, select: { id: true, title: true, fileName: true, criterion: true }, take: LIMIT }) as Promise<{ id: string; title: string; fileName: string; criterion: number | null }[]>);
    push("evidence", "Evidence files", files.map((f) => ({ title: f.title, sub: `${f.fileName}${f.criterion ? ` · criterion ${f.criterion}` : ""}`, href: `/coordinator/evidence?q=${encodeURIComponent(f.title)}` })));
  }
  push("help", "Help and glossary", await helpHits(q, H, false));
  return { groups, suggestions: groups.length ? [] : await closest(q, H, sc.batchIds) };
}

async function helpHits(q: string, chairmanId: string | null, student: boolean): Promise<Hit[]> {
  const articles = await g(() => prisma.helpArticle.findMany({ where: { published: true, OR: [{ chairmanId: null }, ...(chairmanId ? [{ chairmanId }] : [])], AND: [{ OR: [{ title: ci(q) }, { summary: ci(q) }, { keywords: ci(q) }] }], ...(student ? { roles: { contains: "STUDENT" } } : {}) }, select: { id: true, title: true, kind: true, href: true }, take: LIMIT }));
  const lq = q.toLowerCase();
  const terms = GLOSSARY.filter((t) => t.term.toLowerCase().includes(lq) || t.meaning.toLowerCase().includes(lq)).slice(0, 3);
  return [
    ...articles.map((a) => ({ title: a.title, sub: a.kind === "FAQ" ? "Question and answer" : "Guide", href: student ? `/student/help?a=${a.id}` : `/help?a=${a.id}` })),
    ...terms.map((t) => ({ title: t.term, sub: "Glossary", href: student ? "/student/help" : `/help/glossary#${t.key}` })),
  ];
}

/** "Did you mean": names and course titles that look like the words typed (trigram similarity), within scope. */
async function closest(q: string, chairmanId: string | null, batchIds: string[] | null): Promise<string[]> {
  if (!chairmanId) return [];
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT t FROM (
         SELECT c.title AS t, similarity(c.title, $1) AS s FROM "Course" c JOIN "User" u ON u.id = c."coordinatorId" WHERE u."managedById" = $2
         UNION ALL SELECT c.code, similarity(c.code, $1) FROM "Course" c JOIN "User" u ON u.id = c."coordinatorId" WHERE u."managedById" = $2
         UNION ALL SELECT s.name, similarity(s.name, $1) FROM "Student" s JOIN "Batch" b ON b.id = s."batchId" JOIN "User" u ON u.id = b."coordinatorId" WHERE u."managedById" = $2 ${batchIds ? `AND s."batchId" = ANY($3)` : ""}
         UNION ALL SELECT x.name, similarity(x.name, $1) FROM "User" x WHERE x."managedById" = $2
       ) z WHERE s > 0.25 GROUP BY t ORDER BY max(s) DESC LIMIT 5`, q, chairmanId, ...(batchIds ? [batchIds] : []))) as { t: string }[];
    return rows.map((r) => r.t);
  } catch { return []; } // pg_trgm not installed yet (migration_search.sql)
}

// Recent searches, per person (the last ten).
export async function remember(ownerKey: string, q: string) {
  const t = q.trim().slice(0, 80); if (t.length < 2) return;
  try {
    await sdb.searchHistory.deleteMany({ where: { ownerKey, query: t } });
    await sdb.searchHistory.create({ data: { id: randomUUID(), ownerKey, query: t } });
    const old = (await sdb.searchHistory.findMany({ where: { ownerKey }, orderBy: { createdAt: "desc" }, skip: 10, select: { id: true } })) as { id: string }[];
    if (old.length) await sdb.searchHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  } catch { /* migration_search.sql not run */ }
}
export async function recent(ownerKey: string): Promise<string[]> {
  try { return ((await sdb.searchHistory.findMany({ where: { ownerKey }, orderBy: { createdAt: "desc" }, take: 10, select: { query: true } })) as { query: string }[]).map((r) => r.query); } catch { return []; }
}
