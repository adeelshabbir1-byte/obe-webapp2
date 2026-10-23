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

/** Dry run or restore: which rows of the backup are missing now, per table; with apply=true, put them back. */
export async function restore(cid: string, b: Backup, apply: boolean, by?: string) {
  if (b.chairmanId !== cid) throw new Error("This backup belongs to another institute.");
  const temp = apply ? await hashPassword("12345678") : "";
  const report: { model: string; label: string; inBackup: number; present: number; missing: number; restored: number; failed: number }[] = [];
  for (const t of TABLES) {
    const rows = b.tables[t.model] || [];
    if (!bdb[t.model]) continue;
    const ids = rows.map((r) => String(r.id));
    const present = new Set<string>();
    for (let i = 0; i < ids.length; i += 1000) ((await bdb[t.model].findMany({ where: { id: { in: ids.slice(i, i + 1000) } }, select: { id: true } }).catch(() => [])) as { id: string }[]).forEach((r) => present.add(r.id));
    const missing = rows.filter((r) => !present.has(String(r.id)));
    // Staff: people directly under the Institute Head first (others point to them).
    if (t.model === "user") missing.sort((a, b2) => (a.managedById === cid ? 0 : 1) - (b2.managedById === cid ? 0 : 1));
    let restored = 0, failed = 0;
    if (apply && missing.length) {
      const data = missing.map((r) => { const o = revive(r); if (t.model === "user") { o.passwordHash = temp; o.mustChangePassword = true; o.mfaSecret = null; } return o; });
      for (let i = 0; i < data.length; i += 300) {
        const part = data.slice(i, i + 300);
        try { restored += (await bdb[t.model].createMany({ data: part, skipDuplicates: true })).count; }
        catch { for (const one of part) { try { await bdb[t.model].create({ data: one }); restored++; } catch { failed++; } } }
      }
    }
    report.push({ model: t.model, label: t.label, inBackup: rows.length, present: rows.length - missing.length, missing: missing.length, restored, failed });
  }
  if (apply) await writeAuditLog({ actorUserId: by || null, action: "INSTITUTE_RESTORED", metadata: { from: b.createdAt, restored: report.reduce((a, r) => a + r.restored, 0) } as never });
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
