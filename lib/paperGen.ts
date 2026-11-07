import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { draftPaper, makeVariant, type DraftOpts, type Item } from "./qbankCore";
import { allStored, saveSetting } from "./scopedSettings";

// Queue item 18: the paper generated at run time by the Controller from the course's question bank, under settings
// the Subject Expert (or the instructor) proposes, the Program Lead checks and the OMC approves; then locked.
const db = prisma as unknown as Record<string, any>;
export const PG_HINT = "Run prisma/migration_adeel_p13.sql (System Health → database updates) first.";
export type Spec = { total: number; minutes: number; cloShares: Record<string, number>; bloom?: Record<string, number>; difficulty?: Record<string, number>; versions?: number };
export type Setting = { id: string; chairmanId: string; courseCode: string; examType: string; specJson: string; status: string; proposedById: string | null; plById: string | null; plAt: Date | null; omcById: string | null; omcAt: Date | null; updatedAt: Date };
export type Gen = { id: string; chairmanId: string; settingId: string; courseCode: string; examType: string; version: number; itemIdsJson: string; checkCode: string; status: string; reviewById: string | null; reviewAt: Date | null; swapsJson: string; errorNote: string | null; generatedById: string; at: Date };
type U = { id: string; role: string; name: string; managedById?: string | null };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
export const POLICIES = { A: "The course instructor reviews it before printing", B: "The HOD or a subject expert not teaching the course this term reviews it", C: "Sealed: no teacher sees it before the exam" } as const;
export type Policy = keyof typeof POLICIES;

export async function policyOf(chairmanId: string, examType: string): Promise<Policy> {
  const v = (await allStored(chairmanId).catch(() => [])).find((r) => r.key === `papergen.policy.${examType}`)?.value;
  return v === "B" || v === "C" ? v : "A";
}
export async function setPolicy(u: U, chairmanId: string, examType: string, p: Policy) { await saveSetting(chairmanId, "INSTITUTE", chairmanId, `papergen.policy.${examType}`, p, u.id); }

/** The course offerings with this code in the institute, and their people. */
async function offerings(chairmanId: string, code: string) {
  return prisma.course.findMany({ where: { code, coordinator: { managedById: chairmanId } }, select: { id: true, isOffered: true, instructorId: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } }, orderBy: { isOffered: "desc" } });
}
/** Reviewed (approved) questions of the course bank only: an unreviewed question never enters a paper. */
async function bankFor(chairmanId: string, code: string) {
  const { items } = await import("./qbank");
  return (await items(chairmanId, [code])).filter((q) => q.status === "APPROVED" && !q.mcq && q.type !== "MCQ_MULTI") as Item[];
}
async function optsFor(chairmanId: string, code: string, examType: string, spec: Spec, examDate: Date | null): Promise<DraftOpts> {
  const { omcLimits, lastTaughtBefore, currentTerm } = await import("./qbank");
  const offs = (await offerings(chairmanId, code)).filter((c) => c.isOffered);
  // Only what was taught: the section furthest behind decides (a paper is the same for all sections).
  const taught = await Promise.all(offs.map((c) => lastTaughtBefore(c.id, examDate, examType)));
  const known = taught.filter((x): x is number => x !== null);
  const lim = await omcLimits(chairmanId, examType);
  const term = offs[0] ? await currentTerm(offs[0].id) : `${new Date().getUTCMonth() < 6 ? "Spring" : "Fall"} ${new Date().getUTCFullYear()}`;
  return { total: spec.total, minutes: spec.minutes, cloShares: spec.cloShares, bloom: spec.bloom, difficulty: spec.difficulty, ...lim, lastTaught: known.length ? Math.min(...known) : null, exclude: new Set<string>(), term };
}
/** Enough reviewed questions to build the main paper and every backup version? Says what is missing. */
export async function sufficiency(chairmanId: string, code: string, examType: string, spec: Spec) {
  const bank = await bankFor(chairmanId, code);
  const o = await optsFor(chairmanId, code, examType, spec, null);
  const a = draftPaper(bank, o);
  const gaps = [...a.gaps, ...a.check.fails];
  let used = new Set(a.chosen.map((q) => q.id));
  for (let v = 1; v < Math.max(1, spec.versions || 2); v++) {
    const b = makeVariant(a.chosen, bank, { exclude: used, term: o.term, lastTaught: o.lastTaught });
    if (b.missing.length) gaps.push(`Version ${v + 1}: no equivalent for ${b.missing.slice(0, 4).join(", ")}${b.missing.length > 4 ? "…" : ""}`);
    used = new Set([...Array.from(used), ...b.chosen.map((q) => q.id)]);
  }
  return { ok: !gaps.length, gaps, bank: bank.length, lastTaught: o.lastTaught };
}

export async function settingsOf(chairmanId: string) { return ((await db.paperGenSetting?.findMany({ where: { chairmanId }, orderBy: [{ courseCode: "asc" }, { examType: "asc" }] }).catch(() => null)) || null) as Setting[] | null; }
export async function roleFor(u: U, chairmanId: string, code: string) {
  const offs = await offerings(chairmanId, code);
  const se = offs.some((c) => c.subjectExpertId === u.id), ins = offs.some((c) => c.instructorId === u.id), pl = offs.some((c) => c.coordinatorId === u.id);
  const omc = u.role === "OMC" || !!(await prisma.user.findUnique({ where: { id: u.id }, select: { omcHat: true } }).catch(() => null))?.omcHat;
  const hasSe = offs.some((c) => c.subjectExpertId);
  return { proposer: se || (!hasSe && ins), pl, omc, instructor: ins, offerings: offs };
}
/** Propose (SE, or the instructor where there is no SE) → Program Lead checks → OMC approves → locked. */
export async function act(u: U, chairmanId: string, code: string, examType: string, action: "propose" | "pl" | "omc" | "return", spec?: Spec) {
  const r = await roleFor(u, chairmanId, code);
  const cur = (await db.paperGenSetting.findUnique({ where: { chairmanId_courseCode_examType: { chairmanId, courseCode: code, examType } } })) as Setting | null;
  if (action === "propose") {
    if (!r.proposer) throw new Error("The course's Subject Expert sets these (or the instructor where there is no SE).");
    if (cur?.status === "LOCKED") throw new Error("Locked: a change needs a new proposal approved again — ask the Program Lead to reopen it.");
    if (!spec || !(spec.total > 0) || !(spec.minutes > 0) || !Object.keys(spec.cloShares || {}).length) throw new Error("Set total marks, minutes and the share of each CLO.");
    const data = { specJson: JSON.stringify({ ...spec, versions: Math.max(1, Math.min(4, spec.versions || 2)) }), status: "PROPOSED", proposedById: u.id, plById: null, plAt: null, omcById: null, omcAt: null, updatedAt: new Date() };
    await db.paperGenSetting.upsert({ where: { chairmanId_courseCode_examType: { chairmanId, courseCode: code, examType } }, create: { id: randomUUID(), chairmanId, courseCode: code, examType, ...data }, update: data });
    await notifyUsers(r.offerings.map((c) => c.coordinatorId), { kind: "APPROVAL", title: `${code} ${examType}: paper settings to check`, href: "/paper-generation" });
  } else if (!cur) throw new Error("Nothing proposed yet.");
  else if (action === "return") {
    if (!(r.pl || r.omc)) throw new Error("Only the Program Lead or the OMC.");
    await db.paperGenSetting.update({ where: { id: cur.id }, data: { status: "DRAFT", plById: null, plAt: null, omcById: null, omcAt: null, updatedAt: new Date() } });
  } else if (action === "pl") {
    if (!r.pl) throw new Error("Only the course's Program Lead.");
    if (cur.status !== "PROPOSED") throw new Error("It is not waiting for the Program Lead.");
    const suf = await sufficiency(chairmanId, code, examType, J<Spec>(cur.specJson, {} as Spec));
    if (!suf.ok) throw new Error(`The bank is not enough yet: ${suf.gaps.slice(0, 3).join("; ")}`);
    await db.paperGenSetting.update({ where: { id: cur.id }, data: { status: "PL_OK", plById: u.id, plAt: new Date(), updatedAt: new Date() } });
  } else if (action === "omc") {
    if (!r.omc) throw new Error("Only an OMC member.");
    if (cur.status !== "PL_OK") throw new Error("The Program Lead checks it first.");
    await db.paperGenSetting.update({ where: { id: cur.id }, data: { status: "LOCKED", omcById: u.id, omcAt: new Date(), updatedAt: new Date() } });
  }
  await writeAuditLog({ actorUserId: u.id, action: `PAPERGEN_${action.toUpperCase()}`, entityType: "PaperGenSetting", entityId: `${code}:${examType}` });
}

const code8 = () => randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8);
/** The Controller generates at run time: the main paper and its backup versions, from locked settings only. */
export async function generate(u: U, chairmanId: string, settingId: string, examDate: Date | null) {
  const s = (await db.paperGenSetting.findUnique({ where: { id: settingId } })) as Setting | null;
  if (!s || s.chairmanId !== chairmanId) throw new Error("Not found.");
  if (s.status !== "LOCKED") throw new Error("Only locked settings (approved by the Program Lead and the OMC) can be generated.");
  const spec = J<Spec>(s.specJson, {} as Spec);
  const bank = await bankFor(chairmanId, s.courseCode);
  const o = await optsFor(chairmanId, s.courseCode, s.examType, spec, examDate);
  const a = draftPaper(bank, o);
  if (!a.check.ok || a.gaps.length) throw new Error(`Cannot build the paper: ${[...a.gaps, ...a.check.fails].slice(0, 3).join("; ")}`);
  const prev = ((await db.generatedPaper.findMany({ where: { settingId }, select: { version: true } })) as { version: number }[]).reduce((m, x) => Math.max(m, x.version), 0);
  const versions = [a.chosen]; let used = new Set(a.chosen.map((q) => q.id));
  for (let v = 1; v < Math.max(1, spec.versions || 2); v++) { const b = makeVariant(a.chosen, bank, { exclude: used, term: o.term, lastTaught: o.lastTaught }); versions.push(b.chosen); used = new Set([...Array.from(used), ...b.chosen.map((q) => q.id)]); }
  const policy = await policyOf(chairmanId, s.examType);
  const out: string[] = [];
  for (const [i, qs] of versions.entries()) {
    const id = randomUUID();
    await db.generatedPaper.create({ data: { id, chairmanId, settingId, courseCode: s.courseCode, examType: s.examType, version: prev + i + 1, itemIdsJson: JSON.stringify(qs.map((q) => q.id)), checkCode: code8(), status: policy === "C" ? "REVIEWED" : "GENERATED", generatedById: u.id } });
    out.push(id);
  }
  if (policy !== "C") {
    const offs = await offerings(chairmanId, s.courseCode);
    const who = policy === "A" ? offs.map((c) => c.instructorId) : offs.map((c) => c.subjectExpertId).filter((x) => x && !offs.some((c) => c.instructorId === x));
    await notifyUsers(who, { kind: "APPROVAL", title: `${s.courseCode} ${s.examType}: review the generated paper`, href: "/paper-generation" });
  }
  await writeAuditLog({ actorUserId: u.id, action: "PAPERGEN_GENERATED", entityType: "PaperGenSetting", entityId: settingId, metadata: { versions: versions.length, policy } });
  return out;
}
export async function generatedOf(chairmanId: string) { return ((await db.generatedPaper?.findMany({ where: { chairmanId }, orderBy: { at: "desc" }, take: 200 }).catch(() => [])) || []) as Gen[]; }
/** Who may review a generated paper under the policy (A: instructor; B: HOD or an SE not teaching it this term). */
export async function mayReview(u: U, chairmanId: string, g: Gen) {
  const p = await policyOf(chairmanId, g.examType); if (p === "C") return false;
  const offs = await offerings(chairmanId, g.courseCode);
  if (p === "A") return offs.some((c) => c.instructorId === u.id);
  return u.role === "HEAD_OF_DEPARTMENT" || (offs.some((c) => c.subjectExpertId === u.id) && !offs.some((c) => c.instructorId === u.id));
}
/** The reviewer approves, or swaps one question for an equivalent (logged). */
export async function review(u: U, chairmanId: string, genId: string, swapIndex: number | null) {
  const g = (await db.generatedPaper.findUnique({ where: { id: genId } })) as Gen | null;
  if (!g || g.chairmanId !== chairmanId) throw new Error("Not found.");
  if (!(await mayReview(u, chairmanId, g))) throw new Error("You do not review this paper under the institute's policy.");
  if (g.status !== "GENERATED") throw new Error("Already reviewed or printed.");
  const ids = J<string[]>(g.itemIdsJson, []); const swaps = J<{ i: number; from: string; to: string; by: string; at: string }[]>(g.swapsJson, []);
  if (swapIndex !== null) {
    const bank = await bankFor(chairmanId, g.courseCode); const cur = bank.filter((q) => ids.includes(q.id));
    const s = (await db.paperGenSetting.findUnique({ where: { id: g.settingId } })) as Setting;
    const o = await optsFor(chairmanId, g.courseCode, g.examType, J<Spec>(s.specJson, {} as Spec), null);
    const target = cur.find((q) => q.id === ids[swapIndex]); if (!target) throw new Error("No such question.");
    const v = makeVariant([target], bank, { exclude: new Set(ids), term: o.term, lastTaught: o.lastTaught });
    if (v.missing.length) throw new Error("No equivalent question in the bank for that one.");
    swaps.push({ i: swapIndex, from: ids[swapIndex], to: v.chosen[0].id, by: u.id, at: new Date().toISOString() }); ids[swapIndex] = v.chosen[0].id;
    await db.generatedPaper.update({ where: { id: g.id }, data: { itemIdsJson: JSON.stringify(ids), swapsJson: JSON.stringify(swaps) } });
  } else await db.generatedPaper.update({ where: { id: g.id }, data: { status: "REVIEWED", reviewById: u.id, reviewAt: new Date() } });
  await writeAuditLog({ actorUserId: u.id, action: swapIndex === null ? "PAPERGEN_REVIEWED" : "PAPERGEN_SWAP", entityType: "GeneratedPaper", entityId: g.id });
}
export async function paperItems(chairmanId: string, g: Gen) {
  const bank = await (await import("./qbank")).items(chairmanId, [g.courseCode]);
  const by = new Map(bank.map((q) => [q.id, q])); return J<string[]>(g.itemIdsJson, []).map((id) => by.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
}
/** Public check of a paper's code: what it is and that it came from approved settings — never its questions. */
export async function verify(code: string) {
  const g = (await db.generatedPaper?.findUnique({ where: { checkCode: code.trim().toUpperCase() } }).catch(() => null)) as Gen | null;
  if (!g) return null;
  const s = (await db.paperGenSetting.findUnique({ where: { id: g.settingId } })) as Setting | null;
  const inst = await prisma.user.findUnique({ where: { id: (g as unknown as { chairmanId: string }).chairmanId }, select: { organization: true, name: true } });
  return { course: g.courseCode, examType: g.examType, version: g.version, generatedAt: g.at, status: g.status, omcAt: s?.omcAt || null, plAt: s?.plAt || null, institute: inst?.organization || inst?.name || "" };
}
