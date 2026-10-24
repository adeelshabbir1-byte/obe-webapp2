import { randomUUID, randomBytes } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { findOwningChairmanId } from "./institutionCurriculum";
import { builderScope } from "./curriculumBuilder";
import { RULES } from "./consortium";
import { TEMPLATES } from "./curriculumTemplates";

// Regulations Library: the official documents OBEHUB applies (HEC, NCEAC, NBEAC, PEC policies, notifications,
// curricula, manuals) and consortium MoUs, with the clauses the portal relies on and where each is applied.
//  - Submit: Super Admin, Institute Head or Dean.   Publish / reject: Super Admin or a Curriculum Builder (their councils).
//  - An MoU is published only after every university in its agreement has confirmed it.
//  - Signed-in users see published documents; files sit in the private Storage bucket "regulations" and are
//    served through short-lived signed links after a sign-in check.

export const rdb = prisma as unknown as Record<string, any>;
export const REG_HINT = "The Regulations Library needs prisma/migration_regulations.sql — run it in Supabase (or System Health).";
export const COUNCILS: [string, string][] = [["HEC", "HEC"], ["NCEAC", "NCEAC"], ["NBEAC", "NBEAC"], ["PEC", "PEC"], ["NAHE", "NAHE"], ["CONSORTIUM", "Consortium (MoU)"], ["OTHER", "Other"]];
export const KINDS: [string, string][] = [["POLICY", "Policy"], ["NOTIFICATION", "Notification / circular"], ["CURRICULUM", "Curriculum"], ["MANUAL", "Accreditation manual"], ["GUIDELINES", "Guidelines"], ["LETTER", "Letter"], ["MOU", "MoU (consortium agreement)"]];
export const SUBMIT_ROLES = ["SUPER_USER", "CHAIRMAN", "DEAN"];

export type RegDoc = { id: string; council: string; kind: string; title: string; number: string | null; issuedOn: Date | null; effectiveFrom: Date | null; status: string; supersedesId: string | null; url: string | null; summary: string | null; agreementId: string | null; confirmJson: string; submittedById: string; instituteId: string | null; reviewedAt: Date | null; reviewNote: string | null; createdAt: Date };
export type RegFile = { id: string; docId: string; path: string; name: string; mime: string; size: number; caption: string | null; createdAt: Date };
export type RegClause = { id: string; docId: string; ref: string; page: number | null; quote: string; imageFileId: string | null; createdAt: Date };
type U = { id: string; role: string; extraRoles?: string[] };
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

// ------------------------------------------------------------------ Who may do what
export async function canPublish(user: U, council?: string) {
  if (user.role === "SUPER_USER") return true;
  if (!(user.extraRoles || []).includes("CURRICULUM_BUILDER")) return false;
  const sc = await builderScope(user.id);
  return !!sc && (!council || !sc.councils.length || sc.councils.includes(council));
}
export const instituteOfUser = (u: U) => (u.role === "CHAIRMAN" ? Promise.resolve(u.id) : u.role === "SUPER_USER" ? Promise.resolve(null) : findOwningChairmanId(u.id));
/** May this user see this document? Published (or superseded) — every signed-in user; otherwise its institute and reviewers. */
export async function canSee(user: U, d: RegDoc) {
  if (d.status === "PUBLISHED" || d.status === "SUPERSEDED") return true;
  if (await canPublish(user, d.council)) return true;
  const me = await instituteOfUser(user);
  if (d.submittedById === user.id || (me && d.instituteId === me)) return true;
  if (d.agreementId && me) return !!(await rdb.consortiumAgreementParty.findFirst({ where: { agreementId: d.agreementId, chairmanId: me } }).catch(() => null));
  return false;
}

// ------------------------------------------------------------------ Storage (private bucket "regulations")
const BUCKET = "regulations";
const env = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
export const storageReady = () => !!(env().url && env().key);
async function ensureBucket() {
  const { url, key } = env();
  await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key!, "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 30 * 1024 * 1024 }) }).catch(() => null);
}
const safe = (n: string) => n.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120);
/** A one-time upload link: the browser sends the file straight to Storage (no size limit of our server). */
export async function uploadLink(docId: string, name: string) {
  const { url, key } = env();
  if (!url || !key) throw new Error("File storage is not set up (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).");
  await ensureBucket();
  const path = `${docId}/${randomBytes(6).toString("hex")}-${safe(name)}`;
  const r = await fetch(`${url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`Storage refused the upload (${r.status}).`);
  const d = (await r.json()) as { url: string };
  return { path, uploadUrl: `${url}/storage/v1${d.url}` };
}
/** Put bytes we already hold (starter documents) into Storage. */
export async function putBytes(path: string, data: Buffer, mime: string) {
  const { url, key } = env();
  if (!url || !key) throw new Error("File storage is not set up.");
  await ensureBucket();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": mime, "x-upsert": "true" }, body: new Uint8Array(data) });
  if (!r.ok) throw new Error(`Storage refused ${path} (${r.status}).`);
}
/** A link valid for five minutes, after the caller has checked the user may see the document. */
export async function signedUrl(path: string, download?: string) {
  const { url, key } = env();
  if (!url || !key) throw new Error("File storage is not set up.");
  const r = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) });
  if (!r.ok) throw new Error("File not found.");
  const d = (await r.json()) as { signedURL: string };
  return `${url}/storage/v1${d.signedURL}${download ? `&download=${encodeURIComponent(download)}` : ""}`;
}
async function fetchBytes(path: string) {
  const { url, key } = env();
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key! } });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}
/** Text of a PDF, for search. */
export async function pdfText(data: Buffer) {
  try { const pdf = (await import("pdf-parse")).default as unknown as (b: Buffer) => Promise<{ text: string }>; return (await pdf(data)).text.replace(/\s+\n/g, "\n").slice(0, 400000); } catch { return null; }
}

// ------------------------------------------------------------------ Documents
export async function submit(user: U & { name: string }, f: Record<string, unknown>) {
  if (!SUBMIT_ROLES.includes(user.role)) throw new Error("The Super Admin, an Institute Head or a Dean submits documents.");
  const s = (k: string, n = 300) => (typeof f[k] === "string" ? (f[k] as string).trim().slice(0, n) : "");
  const council = s("council", 20), kind = s("kind", 20);
  if (!COUNCILS.some(([k]) => k === council)) throw new Error("Choose the council.");
  if (!KINDS.some(([k]) => k === kind)) throw new Error("Choose the kind of document.");
  if (!s("title")) throw new Error("Give the document's title.");
  const me = await instituteOfUser(user);
  let agreementId: string | null = null;
  if (kind === "MOU") {
    agreementId = s("agreementId", 60);
    const party = me ? await rdb.consortiumAgreementParty.findFirst({ where: { agreementId, chairmanId: me } }).catch(() => null) : null;
    if (!party) throw new Error("Choose one of your university's consortium agreements for the MoU.");
  }
  const d = (k: string) => (s(k) ? new Date(s(k)) : null);
  const id = randomUUID();
  await rdb.regDocument.create({ data: { id, council: kind === "MOU" ? "CONSORTIUM" : council, kind, title: s("title"), number: s("number", 160) || null, issuedOn: d("issuedOn"), effectiveFrom: d("effectiveFrom"), status: "SUBMITTED", supersedesId: s("supersedesId", 60) || null, url: s("url", 500) || null, summary: s("summary", 3000) || null, agreementId, confirmJson: kind === "MOU" && me ? JSON.stringify({ [me]: { by: user.id, name: user.name, at: new Date().toISOString() } }) : "{}", submittedById: user.id, instituteId: me } });
  await writeAuditLog({ actorUserId: user.id, action: "REG_DOCUMENT_SUBMITTED", entityType: "RegDocument", entityId: id, metadata: { council, kind } });
  return id;
}
export async function attachFile(user: U, docId: string, f: { path: string; name: string; mime: string; size: number; caption?: string }) {
  const d = (await rdb.regDocument.findUnique({ where: { id: docId } })) as RegDoc | null;
  if (!d || !(await canEdit(user, d))) throw new Error("Not found.");
  if (!f.path.startsWith(`${docId}/`)) throw new Error("Bad file.");
  if (!/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(f.mime)) throw new Error("PDF or image files only.");
  const id = randomUUID();
  await rdb.regFile.create({ data: { id, docId, path: f.path, name: f.name.slice(0, 200), mime: f.mime, size: Math.round(f.size) || 0, caption: f.caption?.slice(0, 300) || null, createdById: user.id } });
  if (f.mime === "application/pdf") { const b = await fetchBytes(f.path); const t = b ? await pdfText(b) : null; if (t) await rdb.regDocument.update({ where: { id: docId }, data: { textContent: t } }); }
  return id;
}
async function canEdit(user: U, d: RegDoc) {
  if (await canPublish(user, d.council)) return true;
  if (d.status !== "SUBMITTED" && d.status !== "REJECTED") return false;
  const me = await instituteOfUser(user);
  return d.submittedById === user.id || (!!me && d.instituteId === me && SUBMIT_ROLES.includes(user.role));
}
/** Each university of an MoU's agreement confirms it is the signed MoU. */
export async function confirmMou(user: U & { name: string }, docId: string) {
  const d = (await rdb.regDocument.findUnique({ where: { id: docId } })) as RegDoc | null;
  if (!d || d.kind !== "MOU") throw new Error("Not found.");
  if (!["CHAIRMAN", "DEAN"].includes(user.role)) throw new Error("The Institute Head or Dean confirms an MoU.");
  const me = await instituteOfUser(user);
  if (!me || !(await rdb.consortiumAgreementParty.findFirst({ where: { agreementId: d.agreementId, chairmanId: me } }))) throw new Error("Only the universities of this agreement confirm it.");
  const c = j<Record<string, unknown>>(d.confirmJson, {});
  c[me] = { by: user.id, name: user.name, at: new Date().toISOString() };
  await rdb.regDocument.update({ where: { id: docId }, data: { confirmJson: JSON.stringify(c) } });
  return "Confirmed for your university.";
}
export async function mouPending(d: RegDoc) {
  if (d.kind !== "MOU" || !d.agreementId) return [];
  const parties = (await rdb.consortiumAgreementParty.findMany({ where: { agreementId: d.agreementId } })) as { chairmanId: string }[];
  const c = j<Record<string, unknown>>(d.confirmJson, {});
  return parties.filter((p) => !c[p.chairmanId]).map((p) => p.chairmanId);
}
export async function review(user: U, docId: string, publish: boolean, note?: string) {
  const d = (await rdb.regDocument.findUnique({ where: { id: docId } })) as RegDoc | null;
  if (!d) throw new Error("Not found.");
  if (!(await canPublish(user, d.council))) throw new Error("The Super Admin or a Curriculum Builder for this council publishes documents.");
  if (publish) {
    if (!((await rdb.regFile.count({ where: { docId } })) as number) && !d.url) throw new Error("Attach the document (PDF or screenshot) or give its official web address first.");
    const wait = await mouPending(d);
    if (wait.length) throw new Error("Every university in the agreement must confirm the MoU first.");
  } else if (!note?.trim()) throw new Error("Say why, for the submitter.");
  await rdb.regDocument.update({ where: { id: docId }, data: { status: publish ? "PUBLISHED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note?.trim().slice(0, 500) || null } });
  if (publish && d.supersedesId) await rdb.regDocument.update({ where: { id: d.supersedesId }, data: { status: "SUPERSEDED" } }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: publish ? "REG_DOCUMENT_PUBLISHED" : "REG_DOCUMENT_REJECTED", entityType: "RegDocument", entityId: docId, metadata: { note: note || null } });
  if (publish && d.kind !== "MOU") {
    const heads = await prisma.user.findMany({ where: { role: { in: ["CHAIRMAN", "DEAN"] }, isActive: true }, select: { id: true } });
    await notifyUsers(heads.map((h) => h.id), { kind: "REGULATION", title: `${d.council}: ${d.title}`, body: `${d.number ? `${d.number}. ` : ""}${d.effectiveFrom ? `Effective from ${d.effectiveFrom.toISOString().slice(0, 10)}. ` : ""}${d.summary?.slice(0, 200) || ""}`, href: `/regulations/${docId}` }).catch(() => null);
  }
  return publish ? "Published — every signed-in user can see it; Institute Heads and Deans are notified." : "Returned to the submitter.";
}
export async function withdraw(user: U, docId: string) {
  const d = (await rdb.regDocument.findUnique({ where: { id: docId } })) as RegDoc | null;
  if (!d || !(await canPublish(user, d.council))) throw new Error("Not found.");
  await rdb.regDocument.update({ where: { id: docId }, data: { status: "WITHDRAWN" } });
  return "Withdrawn.";
}

// ------------------------------------------------------------------ Clauses and where they apply
export async function addClause(user: U, docId: string, f: { ref: string; page?: unknown; quote: string; imageFileId?: string; targets?: string[] }) {
  const d = (await rdb.regDocument.findUnique({ where: { id: docId } })) as RegDoc | null;
  if (!d || !(await canEdit(user, d))) throw new Error("Not found.");
  if (!f.ref?.trim() || !f.quote?.trim()) throw new Error("Give the clause reference and its text.");
  const id = randomUUID();
  await rdb.regClause.create({ data: { id, docId, ref: f.ref.trim().slice(0, 120), page: Number(f.page) || null, quote: f.quote.trim().slice(0, 4000), imageFileId: f.imageFileId || null, createdById: user.id } });
  for (const t of f.targets || []) await link(user, id, t);
  return id;
}
export async function link(user: U, clauseId: string, target: string, on = true) {
  const c = (await rdb.regClause.findUnique({ where: { id: clauseId } })) as RegClause | null;
  const d = c ? ((await rdb.regDocument.findUnique({ where: { id: c.docId } })) as RegDoc) : null;
  if (!c || !d || !(await canEdit(user, d))) throw new Error("Not found.");
  if (!TARGETS().some((t) => t.key === target)) throw new Error("Unknown place in the portal.");
  if (on) await rdb.regLink.upsert({ where: { clauseId_target: { clauseId, target } }, create: { clauseId, target, createdById: user.id }, update: {} });
  else await rdb.regLink.deleteMany({ where: { clauseId, target } });
}
export async function deleteClause(user: U, clauseId: string) {
  const c = (await rdb.regClause.findUnique({ where: { id: clauseId } })) as RegClause | null;
  const d = c ? ((await rdb.regDocument.findUnique({ where: { id: c.docId } })) as RegDoc) : null;
  if (!c || !d || !(await canEdit(user, d))) throw new Error("Not found.");
  await rdb.regLink.deleteMany({ where: { clauseId } });
  await rdb.regClause.delete({ where: { id: clauseId } });
}

/** The places in the portal that apply a regulation. */
export type Target = { key: string; label: string; group: string };
let _targets: Target[] | null = null;
export function TARGETS(): Target[] {
  if (_targets) return _targets;
  _targets = [
    ...RULES.map((r) => ({ key: `rule:${r.key}`, label: r.label, group: `Consortium rules — ${r.group}` })),
    ...TEMPLATES.map((t) => ({ key: `template:${t.key}`, label: `${t.council} ${t.version} — ${t.program}`, group: "Curriculum templates" })),
    { key: "page:policy-check", label: "HEC UG Policy check (credits, General Education)", group: "Pages" },
    { key: "page:ga", label: "Graduate attributes / PLOs", group: "Pages" },
    { key: "page:accreditation", label: "Accreditation (NCEAC SAR, criteria)", group: "Pages" },
    { key: "page:aol", label: "NBEAC Assurance of Learning", group: "Pages" },
    { key: "page:odl", label: "ODL courses (consortium)", group: "Pages" },
    { key: "page:joint", label: "Joint degree programmes", group: "Pages" },
    { key: "page:exams", label: "Proctored exams and exam centres", group: "Pages" },
    { key: "page:grading", label: "Grading, CGPA and graduation", group: "Pages" },
  ];
  return _targets;
}

/** Published clauses applied at these places — for the "Source" chips across the portal. */
export async function sourcesFor(targets: string[]) {
  const links = (await rdb.regLink.findMany({ where: { target: { in: targets } } }).catch(() => [])) as { clauseId: string; target: string }[];
  if (!links.length) return new Map<string, { clauseId: string; docId: string; label: string; ref: string }[]>();
  const clauses = (await rdb.regClause.findMany({ where: { id: { in: links.map((l) => l.clauseId) } } })) as RegClause[];
  const docs = (await rdb.regDocument.findMany({ where: { id: { in: clauses.map((c) => c.docId) }, status: "PUBLISHED" } })) as RegDoc[];
  const m = new Map<string, { clauseId: string; docId: string; label: string; ref: string }[]>();
  for (const l of links) {
    const c = clauses.find((x) => x.id === l.clauseId), d = c && docs.find((x) => x.id === c.docId);
    if (!c || !d) continue;
    m.set(l.target, [...(m.get(l.target) || []), { clauseId: c.id, docId: d.id, label: `${d.council} ${d.title}`, ref: `${c.ref}${c.page ? `, p. ${c.page}` : ""}` }]);
  }
  return m;
}

export async function search(user: U, q: string, f: { council?: string; kind?: string; status?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (f.council) where.council = f.council;
  if (f.kind) where.kind = f.kind;
  where.status = f.status === "all" ? { in: ["PUBLISHED", "SUPERSEDED"] } : f.status === "review" ? { in: ["SUBMITTED"] } : "PUBLISHED";
  const term = q.trim();
  if (term) where.OR = [{ title: { contains: term, mode: "insensitive" } }, { number: { contains: term, mode: "insensitive" } }, { summary: { contains: term, mode: "insensitive" } }, { textContent: { contains: term, mode: "insensitive" } }];
  let docs = (await rdb.regDocument.findMany({ where, orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }], take: 200, select: { id: true, council: true, kind: true, title: true, number: true, issuedOn: true, effectiveFrom: true, status: true, supersedesId: true, url: true, summary: true, agreementId: true, confirmJson: true, submittedById: true, instituteId: true, reviewedAt: true, reviewNote: true, createdAt: true } })) as RegDoc[];
  if (f.status === "review") { const ok: RegDoc[] = []; for (const d of docs) if (await canSee(user, d)) ok.push(d); docs = ok; }
  const clauses = term ? ((await rdb.regClause.findMany({ where: { quote: { contains: term, mode: "insensitive" } }, take: 50 })) as RegClause[]) : [];
  return { docs, clauses };
}
