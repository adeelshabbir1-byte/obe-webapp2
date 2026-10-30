import { gzipSync, gunzipSync } from "zlib";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { writeAuditLog } from "./audit";

// Backups per institute: one compressed JSON file with every academic table of ONE institute (no passwords or MFA
// secrets). Made weekly by the cron (kept in private Supabase Storage, last 8 kept) or on demand. Restore is safe by
// design: it puts back rows that are MISSING (deleted by mistake), never overwrites rows that exist, in parent-first
// order; a dry run first shows table by table what is present and what would come back. Restored staff get the
// temporary password 12345678 and must change it; restored students activate their account again.

const bdb = prisma as unknown as Record<string, any>;
export const BACKUP_VERSION = 1;
type Ids = { cid: string; staff: string[]; batches: string[]; students: string[]; courses: string[]; sessions: string[]; invoices: string[] };
type Table = { model: string; label: string; where: (x: Ids) => Record<string, unknown>; omit?: string[] };

// Parent-first order (restore inserts in this order).
export const TABLES: Table[] = [
  { model: "department", label: "Departments", where: (x) => ({ chairmanId: x.cid }) },
  { model: "user", label: "Staff", where: (x) => ({ id: { in: x.staff } }), omit: ["passwordHash", "mfaSecret"] },
  { model: "room", label: "Rooms", where: (x) => ({ chairmanId: x.cid }) },
  { model: "batch", label: "Batches", where: (x) => ({ id: { in: x.batches } }) },
  { model: "student", label: "Students", where: (x) => ({ id: { in: x.students } }), omit: ["passwordHash"] },
  { model: "pLO", label: "Graduate attributes (PLOs)", where: (x) => ({ batchId: { in: x.batches } }) },
  { model: "course", label: "Courses", where: (x) => ({ id: { in: x.courses } }) },
  { model: "cLO", label: "CLOs", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "coursePloMapping", label: "Course–PLO mapping", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "lectureRow", label: "Lecture plans", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "assessmentInstrument", label: "Assessments", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "studentEnrollment", label: "Enrolments", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "studentMark", label: "Marks", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "attendanceRecord", label: "Attendance", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "courseResult", label: "Course results", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "gradeChangeRequest", label: "Grade changes", where: (x) => ({ courseId: { in: x.courses } }) },
  { model: "studentTranscriptRecord", label: "Transcript records", where: (x) => ({ studentId: { in: x.students } }) },
  { model: "semesterDates", label: "Semester dates", where: (x) => ({ coordinatorId: { in: x.staff } }) },
  { model: "examSession", label: "Exam sessions", where: (x) => ({ chairmanId: x.cid }) },
  { model: "examPaper", label: "Exam papers", where: (x) => ({ sessionId: { in: x.sessions } }) },
  { model: "feeInvoice", label: "Fee invoices", where: (x) => ({ chairmanId: x.cid }) },
  { model: "feePayment", label: "Fee payments", where: (x) => ({ invoiceId: { in: x.invoices } }) },
  { model: "alumni", label: "Alumni", where: (x) => ({ chairmanId: x.cid }) },
  { model: "employer", label: "Employers", where: (x) => ({ chairmanId: x.cid }) },
];

async function scope(cid: string): Promise<Ids> {
  const staff = (await prisma.user.findMany({ where: { OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true } })).map((u) => u.id);
  const batches = (await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true } })).map((b) => b.id);
  const students = (await prisma.student.findMany({ where: { batchId: { in: batches.concat("none") } }, select: { id: true } })).map((s) => s.id);
  const courses = (await prisma.course.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true } })).map((c) => c.id);
  const sessions = ((await bdb.examSession.findMany({ where: { chairmanId: cid }, select: { id: true } }).catch(() => [])) as { id: string }[]).map((s) => s.id);
  const invoices = ((await bdb.feeInvoice.findMany({ where: { chairmanId: cid }, select: { id: true } }).catch(() => [])) as { id: string }[]).map((s) => s.id);
  const n = (a: string[]) => a.concat("none");
  return { cid, staff: n(staff), batches: n(batches), students: n(students), courses: n(courses), sessions: n(sessions), invoices: n(invoices) };
}

export type Backup = { version: number; chairmanId: string; institute: string; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

export async function makeBackup(cid: string): Promise<{ data: Buffer; counts: Record<string, number>; name: string }> {
  const x = await scope(cid);
  const head = await prisma.user.findUnique({ where: { id: cid }, select: { name: true, instituteName: true } });
  const tables: Backup["tables"] = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = ((await bdb[t.model]?.findMany({ where: t.where(x) }).catch(() => null)) || []) as Record<string, unknown>[];
    tables[t.model] = rows.map((r) => { const o = { ...r }; for (const k of t.omit || []) delete o[k]; return o; });
    counts[t.model] = rows.length;
  }
  const b: Backup = { version: BACKUP_VERSION, chairmanId: cid, institute: head?.instituteName || head?.name || "", createdAt: new Date().toISOString(), tables };
  return { data: gzipSync(Buffer.from(JSON.stringify(b))), counts, name: `obehub-backup-${new Date().toISOString().slice(0, 10)}.json.gz` };
}

export function readBackup(buf: Buffer): Backup {
  let txt: string;
  try { txt = gunzipSync(buf).toString("utf-8"); } catch { txt = buf.toString("utf-8"); }
  const b = JSON.parse(txt) as Backup;
  if (!b || b.version !== BACKUP_VERSION || !b.tables) throw new Error("This is not an OBEHUB backup file.");
  return b;
}

const DATE_KEY = /(At|Date|On|Until|At_|expiresAt|startDate|endDate|date)$/;
function revive(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === "string" && DATE_KEY.test(k) && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v;
  return o;
}

/**
 * Dry run or restore: which rows of the backup are missing now, per table; with apply=true, put them back. Into an
 * empty database too: rows whose parent isn't back yet are retried in further passes, and rows that point at each
 * other (a department and its head, staff managed by staff) go in with those links blank first and get them back once
 * every row is in.
 */
export async function restore(cid: string, b: Backup, apply: boolean, by?: string) {
  if (b.chairmanId !== cid) throw new Error("This backup belongs to another institute.");
  const temp = apply ? await hashPassword("12345678") : "";
  type Row = Record<string, unknown>;
  const state = new Map<string, { t: Table; rows: Row[]; present: number; pending: Row[]; restored: number; failed: number }>();
  for (const t of TABLES) {
    const rows = b.tables[t.model] || [];
    if (!bdb[t.model]) continue;
    const ids = rows.map((r) => String(r.id));
    const present = new Set<string>();
    for (let i = 0; i < ids.length; i += 1000) ((await bdb[t.model].findMany({ where: { id: { in: ids.slice(i, i + 1000) } }, select: { id: true } }).catch(() => [])) as { id: string }[]).forEach((r) => present.add(r.id));
    const missing = rows.filter((r) => !present.has(String(r.id)));
    // Staff: people directly under the Institute Head first (others point to them).
    if (t.model === "user") missing.sort((a, b2) => (a.managedById === cid ? 0 : 1) - (b2.managedById === cid ? 0 : 1));
    const pending = missing.map((r) => { const o = revive(r); if (t.model === "user") { o.passwordHash = temp; o.mustChangePassword = true; o.mfaSecret = null; } return o; });
    state.set(t.model, { t, rows, present: present.size, pending, restored: 0, failed: 0 });
  }
  const insert = async (model: string, data: Row[]) => {
    const done: Row[] = [];
    for (let i = 0; i < data.length; i += 300) {
      const part = data.slice(i, i + 300);
      try { await bdb[model].createMany({ data: part, skipDuplicates: true }); done.push(...part); }
      catch { for (const one of part) { try { await bdb[model].create({ data: one }); done.push(one); } catch { /* retried in the next pass */ } } }
    }
    return done;
  };
  const deferred: { model: string; id: unknown; data: Row }[] = [];
  if (apply) {
    // Normal passes (parent-first order), then one pass with self/cross links left blank, then normal passes again.
    for (let pass = 0; pass < 8; pass++) {
      let progress = 0;
      const relaxed = pass === 3;
      for (const s of Array.from(state.values())) {
        if (!s.pending.length) continue;
        const rows = relaxed ? s.pending.map((r) => { const links: Row = {}; const o: Row = { ...r }; for (const k of Object.keys(o)) if (k !== "id" && /Id$/.test(k) && o[k] != null && !["chairmanId", "coordinatorId", "batchId", "courseId", "studentId"].includes(k)) { links[k] = o[k]; o[k] = null; } return { o, links }; }) : s.pending.map((o) => ({ o, links: {} as Row }));
        const done = new Set((await insert(s.t.model, rows.map((x) => x.o))).map((r) => String(r.id)));
        if (relaxed) for (const x of rows) if (done.has(String(x.o.id)) && Object.keys(x.links).length) deferred.push({ model: s.t.model, id: x.o.id, data: x.links });
        s.restored += done.size; progress += done.size;
        s.pending = s.pending.filter((r) => !done.has(String(r.id)));
      }
      if (!progress && pass > 3) break;
    }
    for (const d of deferred) await bdb[d.model].update({ where: { id: d.id }, data: d.data }).catch(() => null);
    for (const s of Array.from(state.values())) s.failed = s.pending.length;
  }
  const report = Array.from(state.values()).map((s) => ({ model: s.t.model, label: s.t.label, inBackup: s.rows.length, present: s.present, missing: s.rows.length - s.present, restored: s.restored, failed: s.failed }));
  if (apply) await writeAuditLog({ actorUserId: by || null, action: "INSTITUTE_RESTORED", metadata: { from: b.createdAt, restored: report.reduce((a, r) => a + r.restored, 0) } as never }).catch(() => null);
  return report;
}

// ---- Stored backups (private Supabase Storage bucket "institute-backups") ----
const BUCKET = "institute-backups";
const env = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
export const storageReady = () => !!(env().url && env().key);

export async function storeBackup(cid: string, data: Buffer, name: string) {
  const { url, key } = env();
  if (!url || !key) throw new Error("Stored backups need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const h = { Authorization: `Bearer ${key}`, apikey: key };
  await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => null);
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${cid}/${name}`, { method: "POST", headers: { ...h, "Content-Type": "application/gzip", "x-upsert": "true" }, body: new Uint8Array(data) });
  if (!r.ok) throw new Error(`Storage refused the backup (${r.status}).`);
  // Keep the newest 8.
  const all = await listBackups(cid);
  const old = all.slice(8).map((f) => `${cid}/${f.name}`);
  if (old.length) await fetch(`${url}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: old }) }).catch(() => null);
}

export async function listBackups(cid: string): Promise<{ name: string; size: number; created: string }[]> {
  const { url, key } = env();
  if (!url || !key) return [];
  const r = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${cid}/`, limit: 100, sortBy: { column: "name", order: "desc" } }) }).catch(() => null);
  if (!r || !r.ok) return [];
  const xs = (await r.json()) as { name: string; created_at: string; metadata?: { size?: number } }[];
  return xs.filter((f) => f.name.endsWith(".json.gz")).map((f) => ({ name: f.name, size: f.metadata?.size || 0, created: f.created_at }));
}

export async function fetchBackup(cid: string, name: string): Promise<Buffer> {
  const { url, key } = env();
  if (!url || !key || !/^[\w.-]+$/.test(name)) throw new Error("Backup not found.");
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${cid}/${name}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
  if (!r.ok) throw new Error("Backup not found.");
  return Buffer.from(await r.arrayBuffer());
}

/** Weekly (cron, Sundays): a stored backup of every active institute. */
export async function weeklyBackups(now = new Date()) {
  if (now.getUTCDay() !== 0 || !storageReady()) return 0;
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
  let n = 0;
  for (const h of heads) { try { const b = await makeBackup(h.id); await storeBackup(h.id, b.data, b.name); n++; } catch { /* next */ } }
  return n;
}
