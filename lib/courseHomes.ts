import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { addItem, type Item } from "./committeeEngine";
import type { Outcome } from "./committeeCore";
import {
  LEVEL_LABEL, assignCodes, chainsForDept, duplicateCodes, findMatches, homeBase, proposeHome, subjectKey, suggestChain, theoryKey,
  type Dept, type Level, type Placement, type Program, type Subject,
} from "./courseHomeCore";

// Course homes and codes for an institute: subjects (the same course across programs and batches), where each lives,
// its PREFIX-YCN code, drafts saved by the Dean / Chairman / HOD / Program Lead and approved only by the BOS, and the
// approved catalog. After approval codes never change silently: a changed code keeps the old one as an alias; finished
// offerings (and so transcripts) keep the code they were taken under. The home also decides the content-sync base.

const db = prisma as unknown as Record<string, any>;
export const HOMES_HINT = "Run prisma/migration_course_homes.sql (and migration_committee_engine.sql) in Supabase first.";
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const TERMS = ["Spring", "Summer", "Fall"];
const startKey = (t: string | null | undefined, y: number | null | undefined) => (y || 0) * 10 + Math.max(0, TERMS.indexOf(t || "Spring"));
export type Entry = { level?: Level; departmentId?: string | null; program?: string | null; track?: string | null; chain?: number | null; renumber?: boolean };
export type Home = { id: string; key: string; title: string; isLab: boolean; level: Level; departmentId: string | null; program: string | null; track: string | null; chain: number | null; code: string | null; aliasesJson: string; approvedAt: Date };

/** Departments with their prefix, programs with theirs (CourseCodeScheme: the Dean's department prefix, a program's own). */
export async function structure(chairmanId: string) {
  const [deps, schemes, batches] = await Promise.all([
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.courseCodeScheme.findMany({ where: { chairmanId } }).catch(() => []) as Promise<{ departmentId: string; program: string | null; prefix: string }[]>,
    prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { departmentId: true } } } }),
  ]);
  const depts: Dept[] = deps.map((d) => ({ id: d.id, name: d.name, prefix: schemes.find((s) => s.departmentId === d.id && !s.program)?.prefix || null }));
  const progNames = Array.from(new Set(batches.map((b) => b.degreeProgram)));
  const programs: (Program & { oldest: number })[] = progNames.map((p) => {
    const bs = batches.filter((b) => b.degreeProgram === p);
    const dep = bs.map((b) => b.coordinator.departmentId).find(Boolean) || null;
    return { name: p, departmentId: dep, prefix: schemes.find((s) => s.program && s.program.toLowerCase() === p.toLowerCase())?.prefix || null, oldest: Math.min(...bs.map((b) => startKey(b.startTerm, b.startYear))) };
  });
  const leads = (await db.deptLeadProgram.findMany({ where: { chairmanId } }).catch(() => [])) as { departmentId: string; program: string }[];
  const leadOf = (deptId: string | null) => leads.find((l) => l.departmentId === deptId)?.program || programs.filter((p) => p.departmentId === deptId).sort((a, b) => a.oldest - b.oldest)[0]?.name || null;
  return { depts, programs, leadOf };
}

export async function chainsOf(chairmanId: string, dept: Dept) {
  const rows = (await db.codeChain.findMany({ where: { chairmanId, departmentId: dept.id } }).catch(() => [])) as { chain: number; name: string }[];
  const base = chainsForDept(dept.name);
  return base.map((c) => ({ ...c, name: rows.find((r) => r.chain === c.chain)?.name || c.name, own: rows.some((r) => r.chain === c.chain) }));
}

/** Every subject (one course across programs and batches), with confirmed matches merged. */
export async function subjects(chairmanId: string) {
  const [courses, merges] = await Promise.all([
    prisma.course.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, subjectHomeDepartmentId: true, batchId: true, batch: { select: { degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { departmentId: true } } } }, coordinator: { select: { departmentId: true } } } }),
    db.courseKeyMerge.findMany({ where: { chairmanId } }).catch(() => []) as Promise<{ fromKey: string; toKey: string }[]>,
  ]);
  const to = new Map(merges.map((m) => [m.fromKey, m.toKey]));
  const resolve = (k: string) => { let x = k; for (let i = 0; i < 5 && to.has(x); i++) x = to.get(x)!; return x; };
  const by = new Map<string, Subject & { codes: string[]; creditHours: number; category: string; courseIds: string[]; copies: { courseId: string; program: string | null; departmentId: string | null; startKey: number; hasBatch: boolean }[] }>();
  for (const c of courses) {
    const k = resolve(subjectKey(c.title));
    if (!k) continue;
    const s = by.get(k) || { key: k, title: c.title, isLab: k.endsWith("|lab"), uses: [], codes: [], creditHours: c.creditHours, category: c.courseType, courseIds: [], copies: [], homeDeptHint: null };
    if (c.batch) s.uses.push({ courseId: c.id, program: c.batch.degreeProgram, departmentId: c.batch.coordinator.departmentId, semester: c.semesterNumber, category: c.courseType });
    s.copies.push({ courseId: c.id, program: c.batch?.degreeProgram || null, departmentId: c.batch?.coordinator.departmentId || c.coordinator.departmentId, startKey: c.batch ? startKey(c.batch.startTerm, c.batch.startYear) : 0, hasBatch: !!c.batch });
    if (!s.codes.includes(c.code)) s.codes.push(c.code);
    s.courseIds.push(c.id);
    if (c.subjectHomeDepartmentId) s.homeDeptHint = c.subjectHomeDepartmentId;
    by.set(k, s);
  }
  return Array.from(by.values());
}

export async function approvedHomes(chairmanId: string) {
  return (await db.courseHome.findMany({ where: { chairmanId } }).catch(() => [])) as Home[];
}
export async function draftsOf(chairmanId: string) {
  return (await db.courseHomeDraft.findMany({ where: { chairmanId, status: { in: ["DRAFT", "SENT"] } }, orderBy: { updatedAt: "desc" } }).catch(() => [])) as { id: string; entriesJson: string; status: string; cmtItemId: string | null; note: string | null; createdById: string; updatedAt: Date; sentAt: Date | null }[];
}

export type BoardRow = {
  key: string; title: string; isLab: boolean; programs: string[]; semesters: number[]; category: string; creditHours: number; currentCodes: string[];
  level: Level; departmentId: string | null; program: string | null; track: string | null; prefix: string | null; chain: number | null; code: string | null; approvedCode: string | null; aliases: string[];
  reason: string; flags: string[]; changed: boolean; approved: boolean;
  home: { level: Level; departmentId: string | null; program: string | null } | null; proposed: { level: Level; departmentId: string | null; program: string | null };
};
/** The board: every subject's home and code — the approved one, a draft's change over it, or the proposal. */
export async function board(chairmanId: string, draftId?: string | null) {
  const [{ depts, programs, leadOf }, subs, homes, drafts] = await Promise.all([structure(chairmanId), subjects(chairmanId), approvedHomes(chairmanId), draftsOf(chairmanId)]);
  const draft = draftId ? drafts.find((d) => d.id === draftId) || null : null;
  const entries = J<Record<string, Entry>>(draft?.entriesJson, {});
  const chainSets = new Map<string, Awaited<ReturnType<typeof chainsOf>>>();
  for (const d of depts) chainSets.set(d.id, await chainsOf(chairmanId, d));
  const prefixOf = (p: Placement) => p.level === "GE" ? "GE" : p.level === "PROGRAM" ? programs.find((x) => x.name === p.program)?.prefix || depts.find((d) => d.id === p.departmentId)?.prefix || null : depts.find((d) => d.id === p.departmentId)?.prefix || null;
  const placed = subs.map((s) => {
    const h = homes.find((x) => x.key === s.key);
    const proposal = proposeHome(s, depts, programs);
    const e = entries[s.key] || {};
    const base: Placement = h ? { level: h.level, departmentId: h.departmentId, program: h.program, prefix: null, reason: "Approved by the BOS" } : proposal;
    const p: Placement = { ...base, ...(e.level ? { level: e.level } : {}), ...(e.departmentId !== undefined ? { departmentId: e.departmentId } : {}), ...(e.program !== undefined ? { program: e.program } : {}) };
    if (p.level !== "PROGRAM") p.program = null;
    if (p.level === "GE") p.departmentId = null;
    p.prefix = prefixOf(p);
    const chainSet = p.level === "GE" ? chainsForDept("humanities") : p.departmentId ? chainSets.get(p.departmentId) : chainsForDept("generic");
    const chain = e.chain ?? h?.chain ?? suggestChain(s.title, chainSet || chainsForDept("generic"));
    return { s, h, p, e, chain, proposal };
  });
  const coded = assignCodes(placed.map(({ s, h, p, e, chain }) => ({ key: s.key, title: s.title, isLab: s.isLab, prefix: p.prefix, semester: Math.min(...s.uses.map((u) => u.semester || 99)) === 99 ? null : Math.min(...s.uses.map((u) => u.semester || 99)), chain, approvedCode: h?.code && h.level === p.level && h.departmentId === p.departmentId && h.program === p.program && !e.renumber ? h.code : null, renumber: !!e.renumber })));
  const dups = duplicateCodes(coded);
  const rows: BoardRow[] = placed.map(({ s, h, p, e, chain, proposal }, i) => {
    const c = coded[i];
    const flags = [...c.flags, ...(p.unclear ? ["Home unclear — used by several departments"] : [])];
    if (dups.some((d) => d.keys.includes(s.key))) flags.push(`Duplicate code ${c.code}`);
    const progs = Array.from(new Set(s.uses.map((u) => u.program)));
    if (p.level === "PROGRAM" && progs.some((x) => x !== p.program)) flags.push(`Home is ${p.program} but ${progs.filter((x) => x !== p.program).join(", ")} also use it`);
    if (p.level === "DEPARTMENT" && s.uses.some((u) => u.departmentId && u.departmentId !== p.departmentId) && !proposal.unclear) flags.push("Used outside its home department");
    if (!s.uses.length) flags.push("No program uses it (no match)");
    return { key: s.key, title: s.title, isLab: s.isLab, programs: progs, semesters: Array.from(new Set(s.uses.map((u) => u.semester).filter((x): x is number => !!x))).sort(), category: s.category, creditHours: s.creditHours, currentCodes: s.codes,
      level: p.level, departmentId: p.departmentId, program: p.program, track: e.track ?? h?.track ?? null, prefix: p.prefix, chain: c.chain ?? chain, code: c.code, approvedCode: h?.code || null, aliases: J<string[]>(h?.aliasesJson, []), reason: h && !Object.keys(e).length ? "Approved by the BOS" : proposal.reason,
      flags, changed: Object.keys(e).length > 0, approved: !!h, home: h ? { level: h.level, departmentId: h.departmentId, program: h.program } : null, proposed: { level: proposal.level, departmentId: proposal.departmentId, program: proposal.program } };
  });
  return { rows, depts, programs: programs.map((p) => ({ ...p, lead: false })), leadOf, chains: { ...Object.fromEntries(Array.from(chainSets.entries()).map(([k, v]) => [k, v.map((c) => ({ chain: c.chain, name: c.name }))])), GE: chainsForDept("humanities").map((c) => ({ chain: c.chain, name: c.name })) } as Record<string, { chain: number; name: string }[]>, draft };
}

/** Matches across degrees to confirm: content-sync groups and equivalence groups, then titles, CLOs and topics by meaning. */
export async function matches(chairmanId: string) {
  const subs = await subjects(chairmanId);
  const keyOfCourse = new Map(subs.flatMap((s) => s.courseIds.map((id) => [id, s.key] as [string, string])));
  const known: { a: string; b: string; reason: string }[] = [];
  const groups = [
    ...(await prisma.courseContentSyncMember.findMany({ where: { group: { chairmanId } }, select: { groupId: true, courseId: true } }).catch(() => [])).map((m) => ({ g: `sync:${m.groupId}`, c: m.courseId })),
    ...(await prisma.courseEquivalenceMember.findMany({ where: { group: { chairmanId } }, select: { groupId: true, courseId: true } }).catch(() => [])).map((m) => ({ g: `eq:${m.groupId}`, c: m.courseId })),
  ];
  const byGroup = new Map<string, Set<string>>();
  for (const x of groups) { const k = keyOfCourse.get(x.c); if (k) byGroup.set(x.g, new Set([...(byGroup.get(x.g) || []), k])); }
  for (const [g, ks] of Array.from(byGroup.entries())) { const arr = Array.from(ks); for (let i = 1; i < arr.length; i++) known.push({ a: arr[0], b: arr[i], reason: g.startsWith("sync") ? "In one content-sync group" : "Course Equivalence group" }); }
  const [clos, rows] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: { in: subs.map((s) => s.courseIds[0]) }, source: "SE" }, select: { courseId: true, statement: true } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: subs.map((s) => s.courseIds[0]) }, source: "SE" }, select: { courseId: true, topic: true } }),
  ]);
  const ms = findMatches(subs.map((s) => ({ key: s.key, title: s.title, clos: clos.filter((c) => c.courseId === s.courseIds[0]).map((c) => c.statement), topics: rows.filter((r) => r.courseId === s.courseIds[0]).map((r) => r.topic).filter(Boolean) })), known);
  const title = new Map(subs.map((s) => [s.key, s.title]));
  return ms.filter((m) => m.a !== m.b).slice(0, 150).map((m) => ({ ...m, titleA: title.get(m.a) || m.a, titleB: title.get(m.b) || m.b }));
}
export async function confirmMatch(user: { id: string }, chairmanId: string, fromKey: string, toKey: string, reason: string) {
  if (fromKey === toKey) throw new Error("Choose two different courses.");
  await db.courseKeyMerge.upsert({ where: { chairmanId_fromKey: { chairmanId, fromKey } }, create: { id: randomUUID(), chairmanId, fromKey, toKey, reason: reason.slice(0, 300), byId: user.id }, update: { toKey, reason: reason.slice(0, 300), byId: user.id, at: new Date() } });
}

// ---- drafts (Dean, Chairman / HOD, Program Lead) and the BOS
type U = { id: string; role: string; name: string; departmentId?: string | null };
/** What a person may change: the Dean the level and department; the HOD within his department; the Program Lead tracks and chains of his program's courses. */
async function allowed(user: U, row: BoardRow, e: Entry) {
  if (["CHAIRMAN", "DEAN"].includes(user.role)) return null;
  if (user.role === "HEAD_OF_DEPARTMENT") {
    if (e.level === "GE" || e.level === "SERVICE") return `${row.title}: only the Dean moves a course to the university common or another department.`;
    if (row.departmentId && row.departmentId !== user.departmentId) return `${row.title} belongs to another department.`;
    return null;
  }
  if (["PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role)) {
    if (e.level !== undefined || e.departmentId !== undefined || e.program !== undefined || e.renumber) return `${row.title}: a Program Lead adjusts tracks and chains only.`;
    const mine = (await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { degreeProgram: true } })).map((b) => b.degreeProgram);
    if (!row.programs.some((p) => mine.includes(p))) return `${row.title} is not in your program.`;
    return null;
  }
  return "Only the Dean, the Institute Head / HOD or a Program Lead saves a draft.";
}
export async function saveDraft(user: U, chairmanId: string, draftId: string | null, changes: Record<string, Entry>, note?: string) {
  const cur = draftId ? (await draftsOf(chairmanId)).find((d) => d.id === draftId) : null;
  if (draftId && !cur) throw new Error("Draft not found (or already sent to the BOS).");
  if (cur?.status === "SENT") throw new Error("This draft is with the BOS. Start a new draft for further changes.");
  const { rows } = await board(chairmanId, draftId);
  for (const [k, e] of Object.entries(changes)) {
    const row = rows.find((r) => r.key === k);
    if (!row) throw new Error("Course not found.");
    const why = await allowed(user, row, e);
    if (why) throw new Error(why);
    if (e.chain !== undefined && e.chain !== null && !(e.chain >= 0 && e.chain <= 9)) throw new Error("A chain is 0–9.");
  }
  const merged = { ...J<Record<string, Entry>>(cur?.entriesJson, {}) };
  for (const [k, e] of Object.entries(changes)) { merged[k] = { ...(merged[k] || {}), ...e }; if (!Object.values(merged[k]).some((v) => v !== undefined)) delete merged[k]; }
  if (cur) { await db.courseHomeDraft.update({ where: { id: cur.id }, data: { entriesJson: JSON.stringify(merged), note: note ?? cur.note, updatedAt: new Date() } }); return cur.id; }
  const id = randomUUID();
  await db.courseHomeDraft.create({ data: { id, chairmanId, entriesJson: JSON.stringify(merged), note: note || null, createdById: user.id } });
  return id;
}
export async function sendToBos(user: U, chairmanId: string, draftId: string, committeeId: string) {
  const d = (await draftsOf(chairmanId)).find((x) => x.id === draftId);
  if (!d || d.status !== "DRAFT") throw new Error("Only a saved draft goes to the BOS.");
  const c = await db.cmtCommittee.findUnique({ where: { id: committeeId } });
  if (!c || c.chairmanId !== chairmanId || c.type !== "BOS") throw new Error("Choose a Board of Studies.");
  const { rows } = await board(chairmanId, draftId);
  const changed = rows.filter((r) => r.changed || !r.approved);
  const summary = changed.slice(0, 40).map((r) => `${r.code || "(no code)"}${r.approvedCode && r.approvedCode !== r.code ? ` (was ${r.approvedCode})` : ""} — ${r.title} · ${LEVEL_LABEL[r.level]}${r.program ? ` ${r.program}` : ""}`).join("\n");
  const itemId = await addItem(user, committeeId, { kind: "COURSE_HOMES", refId: draftId, title: `Course homes and codes — ${changed.length} course(s)`, summary: `${summary}${changed.length > 40 ? `\n… and ${changed.length - 40} more` : ""}${d.note ? `\n\n${d.note}` : ""}`, href: `/course-homes?draft=${draftId}` });
  await db.courseHomeDraft.update({ where: { id: draftId }, data: { status: "SENT", cmtItemId: itemId, sentAt: new Date() } });
  return itemId;
}

/** BOS approved: homes and codes are locked; a changed code keeps the old one as an alias; running offerings take the new code. */
export async function applyApproved(chairmanId: string, draftId: string, by: { id: string; name: string }) {
  const { rows } = await board(chairmanId, draftId);
  const homes = await approvedHomes(chairmanId);
  let codes = 0;
  for (const r of rows.filter((x) => x.changed || !x.approved)) {
    const h = homes.find((x) => x.key === r.key);
    const aliases = Array.from(new Set([...J<string[]>(h?.aliasesJson, []), ...(h?.code && h.code !== r.code ? [h.code] : []), ...r.currentCodes.filter((c) => c !== r.code)]));
    const data = { title: r.title, isLab: r.isLab, level: r.level, departmentId: r.departmentId, program: r.program, track: r.track, chain: r.chain, code: r.code, aliasesJson: JSON.stringify(aliases), approvedAt: new Date(), draftId };
    await db.courseHome.upsert({ where: { chairmanId_key: { chairmanId, key: r.key } }, create: { id: randomUUID(), chairmanId, key: r.key, ...data }, update: data });
    // Offerings not yet finished take the approved code; finished ones (results approved) keep the code they were taken under.
    if (r.code) {
      const subs = (await subjects(chairmanId)).find((s) => s.key === r.key);
      const done = new Set((await prisma.courseResult.findMany({ where: { courseId: { in: subs?.courseIds || [] }, status: "APPROVED" }, select: { courseId: true } })).map((x) => x.courseId));
      for (const id of (subs?.courseIds || []).filter((x) => !done.has(x))) {
        const c = await prisma.course.findUnique({ where: { id }, select: { code: true, batchId: true } });
        if (!c || c.code === r.code) continue;
        if (c.batchId && (await prisma.course.findFirst({ where: { batchId: c.batchId, code: r.code, id: { not: id } } }))) continue;
        await prisma.course.update({ where: { id }, data: { code: r.code } });
        codes++;
      }
    }
  }
  await db.courseHomeDraft.update({ where: { id: draftId }, data: { status: "APPROVED", decidedAt: new Date() } });
  await writeAuditLog({ actorUserId: by.id, action: "COURSE_HOMES_APPROVED", entityType: "CourseHomeDraft", entityId: draftId, metadata: { courses: rows.filter((x) => x.changed || !x.approved).length, codesChanged: codes } });
  return codes;
}
/** Called by the committee engine when the BOS decides a "Course homes and codes" draft. */
export async function bosHandler(item: Item, outcome: Outcome, by: { id: string; name: string }) {
  const d = await db.courseHomeDraft.findUnique({ where: { id: item.refId } });
  if (!d) return;
  if (outcome === "APPROVED" || outcome === "APPROVED_WITH_CHANGES") await applyApproved(d.chairmanId, d.id, by);
  else if (outcome === "REJECTED") await db.courseHomeDraft.update({ where: { id: d.id }, data: { status: "REJECTED", decidedAt: new Date() } });
}

/** Searchable old codes: code or alias → the course. */
export async function findByCode(chairmanId: string, code: string) {
  const c = code.trim().toUpperCase();
  const homes = await approvedHomes(chairmanId);
  return homes.filter((h) => h.code === c || J<string[]>(h.aliasesJson, []).includes(c));
}
/** The approved catalog for the prospectus: code, title, credit hours, prerequisites, home, category. */
export async function catalogRows(chairmanId: string) {
  const { rows, depts } = await board(chairmanId);
  const subs = await subjects(chairmanId);
  const pre = await prisma.course.findMany({ where: { id: { in: subs.map((s) => s.courseIds[0]) } }, select: { id: true, prerequisiteCourse: { select: { title: true } } } });
  const codeOfKey = new Map(rows.map((r) => [r.key, r.code]));
  return rows.filter((r) => r.approved).sort((a, b) => (a.code || "").localeCompare(b.code || "")).map((r) => {
    const s = subs.find((x) => x.key === r.key);
    const p = pre.find((x) => x.id === s?.courseIds[0])?.prerequisiteCourse?.title;
    return { code: r.approvedCode || r.code || "", title: r.title, creditHours: r.creditHours, prerequisites: p ? `${codeOfKey.get(subjectKey(p)) || ""} ${p}`.trim() : "", home: `${LEVEL_LABEL[r.level]}${r.level === "PROGRAM" ? ` — ${r.program}` : r.departmentId ? ` — ${depts.find((d) => d.id === r.departmentId)?.name || ""}` : ""}`, category: r.category, aliases: r.aliases.join(", ") };
  });
}

// ---- the content-sync base follows the home
export async function baseFlags(chairmanId: string) {
  const [{ depts, leadOf }, subs, homes] = await Promise.all([structure(chairmanId), subjects(chairmanId), approvedHomes(chairmanId)]);
  const members = await prisma.courseContentSyncMember.findMany({ where: { group: { chairmanId } }, select: { groupId: true, courseId: true, isBase: true } });
  const out: { groupId: string; key: string; code: string | null; title: string; baseCourseId: string; homeCourseId: string | null; text: string; planned: boolean; homeDeptId: string | null }[] = [];
  const groups = Array.from(new Set(members.map((m) => m.groupId)));
  for (const g of groups) {
    const ms = members.filter((m) => m.groupId === g);
    const base = ms.find((m) => m.isBase);
    const s = subs.find((x) => ms.some((m) => x.courseIds.includes(m.courseId)));
    const h = s ? homes.find((x) => x.key === s.key) : null;
    if (!s || !h || !base) continue;
    const place = { level: h.level, departmentId: h.departmentId, program: h.program, prefix: null, reason: "", leadProgram: leadOf(h.departmentId) };
    const want = homeBase(s.copies.filter((c) => ms.some((m) => m.courseId === c.courseId) || !c.hasBatch), place);
    const baseCopy = s.copies.find((c) => c.courseId === base.courseId);
    const where = (c?: { program: string | null; departmentId: string | null }) => c?.program || depts.find((d) => d.id === c?.departmentId)?.name || "—";
    const homeName = h.level === "PROGRAM" ? h.program : depts.find((d) => d.id === h.departmentId)?.name || "its home";
    if (want && want !== base.courseId) out.push({ groupId: g, key: s.key, code: h.code, title: s.title, baseCourseId: base.courseId, homeCourseId: want, text: `${h.code || s.title}'s base is in ${where(baseCopy)} — move it to ${homeName}?`, planned: false, homeDeptId: h.departmentId });
    else if (!want && (h.level === "SERVICE" || h.level === "DEPARTMENT")) {
      const teaches = await prisma.batch.count({ where: { coordinator: { managedById: chairmanId, departmentId: h.departmentId } } });
      out.push({ groupId: g, key: s.key, code: h.code, title: s.title, baseCourseId: base.courseId, homeCourseId: null, text: teaches ? `${h.code || s.title}: ${homeName} offers it but has no copy in this group — its OMC is asked to adopt the plan.` : `${h.code || s.title}: ${homeName} has no batch — make a department-level copy it owns as the base?`, planned: !!teaches, homeDeptId: h.departmentId });
    }
  }
  return out;
}
/** "Make the home copy the base": logged; the old base's SE is told; content carries forward from the new base from now on. */
export async function makeHomeBase(user: { id: string; name: string; role: string }, chairmanId: string, groupId: string) {
  if (!["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) throw new Error("Only the OMC or the Institute Head / HOD moves a base.");
  const flag = (await baseFlags(chairmanId)).find((f) => f.groupId === groupId);
  if (!flag) throw new Error("This group's base is already in the course's home.");
  let target = flag.homeCourseId;
  const old = await prisma.course.findUnique({ where: { id: flag.baseCourseId }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, subjectExpertId: true } });
  if (!old) throw new Error("Base not found.");
  if (!target) {
    // The teaching department has no batch: a department-level copy (no batch) that it owns and its SE edits.
    if (flag.planned) throw new Error("The home department offers it — its OMC adopts the plan from its own copy.");
    const owner = await prisma.user.findFirst({ where: { managedById: chairmanId, departmentId: flag.homeDeptId, role: { in: ["HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"] }, isActive: true }, select: { id: true } }) || { id: chairmanId };
    const copy = await prisma.course.create({ data: { code: flag.code || old.code, title: old.title, creditHours: old.creditHours, courseType: old.courseType, semesterNumber: old.semesterNumber, coordinatorId: owner.id, batchId: null, subjectHomeDepartmentId: flag.homeDeptId } as never, select: { id: true } });
    const { copyCourseContent } = await import("./benchmarkCopy");
    await copyCourseContent(old.id, copy.id).catch(() => null);
    await prisma.courseContentSyncMember.create({ data: { groupId, courseId: copy.id, isBase: false } });
    target = copy.id;
  }
  await prisma.courseContentSyncMember.updateMany({ where: { groupId, isBase: true }, data: { isBase: false } });
  await prisma.courseContentSyncMember.updateMany({ where: { groupId, courseId: target }, data: { isBase: true } });
  await prisma.courseContentSyncGroup.update({ where: { id: groupId }, data: { needsSync: true } });
  // The base's Subject Expert comes from the home department: its HOD names him.
  await prisma.course.update({ where: { id: old.id }, data: { subjectExpertId: null } });
  await writeAuditLog({ actorUserId: user.id, action: "SYNC_BASE_MOVED_TO_HOME", entityType: "CourseContentSyncGroup", entityId: groupId, metadata: { from: old.id, to: target, code: flag.code || old.code } });
  await notifyUsers([old.subjectExpertId], { kind: "TEMPLATE", title: `${flag.code || old.code} — the base moved to its home`, body: `${user.name} made the home department's copy the base. Your copy now follows it; changes go to the base's Subject Expert.`, href: "/subjectexpert/courses" }).catch(() => null);
  if (flag.homeDeptId) {
    const { approverFor } = await import("./approvers");
    const hod = await approverFor(chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: flag.homeDeptId }).catch(() => ({ ids: [] as string[] }));
    await notifyUsers(hod.ids, { kind: "TEMPLATE", title: `Name the Subject Expert for ${flag.code || old.title}`, body: "Its content-sync base is now your department's copy.", href: "/course-homes?tab=base" }).catch(() => null);
  }
  return target;
}
/** Is this copy inside the course's approved home? null when the course has no approved home yet. */
export async function inHome(courseId: string): Promise<boolean | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, coordinator: { select: { managedById: true, departmentId: true } }, batch: { select: { degreeProgram: true, coordinator: { select: { departmentId: true } } } } } });
  if (!c?.coordinator.managedById) return null;
  const chairmanId = c.coordinator.managedById;
  const merges = (await db.courseKeyMerge.findMany({ where: { chairmanId } }).catch(() => [])) as { fromKey: string; toKey: string }[];
  let key = subjectKey(c.title);
  for (let i = 0; i < 5; i++) { const m = merges.find((x) => x.fromKey === key); if (!m) break; key = m.toKey; }
  const h = (await db.courseHome.findUnique({ where: { chairmanId_key: { chairmanId, key } } }).catch(() => null)) as Home | null;
  if (!h) return null;
  const dept = c.batch?.coordinator.departmentId || c.coordinator.departmentId;
  if (h.level === "PROGRAM") return c.batch?.degreeProgram === h.program;
  if (h.level === "DEPARTMENT") { const lead = (await structure(chairmanId)).leadOf(h.departmentId); return lead ? c.batch?.degreeProgram === lead : dept === h.departmentId; }
  return dept === h.departmentId;
}
export { theoryKey };
