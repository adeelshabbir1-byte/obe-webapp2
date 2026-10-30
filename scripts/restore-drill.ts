/**
 * Backup restore drill: takes the latest stored backup of each institute (or a backup file), restores it into a
 * SCRATCH database, and checks that it really came back — table counts, the key tables' row counts, one student's
 * transcript, and that the database matches this version of the app. Prints pass / fail and, when PRODUCTION_URL and
 * CRON_SECRET are set, records the result so System Health shows "Last restore test".
 *
 *   RESTORE_TEST_DATABASE_URL=postgres://…scratch…  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…  npx tsx scripts/restore-drill.ts
 *   RESTORE_TEST_DATABASE_URL=…  BACKUP_FILE=./obehub-backup.json.gz  npx tsx scripts/restore-drill.ts
 *
 * The scratch database must already have the app's tables (the workflow runs `prisma db push` on it first). The script
 * refuses to run when the scratch database is the live one (DATABASE_URL).
 */
import { readFileSync } from "fs";

const scratch = process.env.RESTORE_TEST_DATABASE_URL || "";
const KEY_TABLES = ["user", "batch", "student", "course", "cLO", "lectureRow", "studentEnrollment", "studentMark", "courseResult", "studentTranscriptRecord"];

async function main() {
  if (!scratch) throw new Error("Set RESTORE_TEST_DATABASE_URL to a scratch database.");
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.split("?")[0] === scratch.split("?")[0]) throw new Error("RESTORE_TEST_DATABASE_URL is the live database — refusing.");
  // Everything below talks to the scratch database only (the storage download needs no database).
  const storageEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.DATABASE_URL = scratch;
  const { readBackup, restore, TABLES } = await import("../lib/instituteBackup");
  const { prisma } = await import("../lib/db");
  const { checkDatabase } = await import("../lib/systemHealth");
  const db = prisma as unknown as Record<string, any>;

  // 1. The latest backup(s).
  const backups: { name: string; buf: Buffer }[] = [];
  if (process.env.BACKUP_FILE) backups.push({ name: process.env.BACKUP_FILE, buf: readFileSync(process.env.BACKUP_FILE) });
  else {
    if (!storageEnv.url || !storageEnv.key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (where the backups are), or BACKUP_FILE.");
    const h = { Authorization: `Bearer ${storageEnv.key}`, apikey: storageEnv.key, "Content-Type": "application/json" };
    const list = async (prefix: string) => (await (await fetch(`${storageEnv.url}/storage/v1/object/list/institute-backups`, { method: "POST", headers: h, body: JSON.stringify({ prefix, limit: 100, sortBy: { column: "name", order: "desc" } }) })).json()) as { name: string; id: string | null }[];
    const institutes = (await list("")).filter((x) => !x.id).map((x) => x.name).slice(0, Number(process.env.RESTORE_DRILL_MAX || 3));
    for (const cid of institutes) {
      const latest = (await list(`${cid}/`)).filter((x) => x.id && x.name.endsWith(".gz"))[0];
      if (!latest) continue;
      const r = await fetch(`${storageEnv.url}/storage/v1/object/institute-backups/${cid}/${latest.name}`, { headers: { Authorization: h.Authorization, apikey: h.apikey } });
      if (r.ok) backups.push({ name: `${cid}/${latest.name}`, buf: Buffer.from(await r.arrayBuffer()) });
    }
  }
  if (!backups.length) throw new Error("No backup found to test.");

  const results: { backup: string; institute: string; ok: boolean; problems: string[]; counts: Record<string, string>; transcript: string }[] = [];
  for (const bk of backups) {
    const b = readBackup(bk.buf);
    const problems: string[] = [];
    // 2. Restore into the scratch database. The Institute Head is not part of the backup (only its staff), so a stand-in
    //    row is created first for the others to point to.
    await db.user.upsert({ where: { id: b.chairmanId }, create: { id: b.chairmanId, username: `drill-${b.chairmanId.slice(0, 8)}`, email: `drill-${b.chairmanId.slice(0, 8)}@restore.test`, name: b.institute || "Institute (restore drill)", role: "CHAIRMAN", passwordHash: "x", isActive: false }, update: {} });
    const report = await restore(b.chairmanId, b, true);
    // 3. Checks: every table's rows are present; the key tables match the backup exactly.
    const counts: Record<string, string> = {};
    for (const r of report) {
      const now = r.present + r.restored;
      counts[r.label] = `${now}/${r.inBackup}`;
      if (r.failed) problems.push(`${r.label}: ${r.failed} row(s) failed to restore`);
      if (KEY_TABLES.includes(r.model) && now !== r.inBackup) problems.push(`${r.label}: ${now} of ${r.inBackup} rows`);
    }
    for (const t of TABLES.filter((x) => KEY_TABLES.includes(x.model))) {
      const ids = (b.tables[t.model] || []).map((r) => String(r.id));
      let found = 0;
      for (let i = 0; i < ids.length; i += 1000) found += await db[t.model].count({ where: { id: { in: ids.slice(i, i + 1000) } } });
      if (found !== ids.length) problems.push(`${t.label}: ${found} of ${ids.length} rows readable after restore`);
    }
    // One student's transcript, computed by the app from the restored rows, matches the backup's records.
    let transcript = "no student with transcript records";
    const rec = (b.tables.studentTranscriptRecord || [])[0] as { studentId?: string } | undefined;
    const sid = rec?.studentId || ((b.tables.studentMark || [])[0] as { studentId?: string } | undefined)?.studentId;
    if (sid) {
      try {
        const { computeStudentTranscriptReport } = await import("../lib/studentTranscriptReport");
        const t = await computeStudentTranscriptReport(sid);
        const want = (b.tables.studentTranscriptRecord || []).filter((r) => r.studentId === sid).length;
        transcript = `student ${sid.slice(0, 8)}…: ${t.courseRows.length} course row(s), CGPA ${t.cgpa ?? "—"}, ${t.totalCredits} credits (backup has ${want} transcript record(s))`;
        if (want && t.courseRows.length < want) problems.push(`Transcript: ${t.courseRows.length} rows, backup has ${want}`);
      } catch (e) { problems.push(`Transcript could not be computed: ${(e as Error).message.slice(0, 120)}`); }
    }
    results.push({ backup: bk.name, institute: b.institute, ok: !problems.length, problems, counts, transcript });
  }
  // 4. The scratch database matches this version of the app (nothing that would break pages).
  const health = await checkDatabase();
  const breaks = health.issues.filter((i) => i.severity === "breaks");
  const passed = results.every((r) => r.ok) && !breaks.length;
  const summary = `${results.length} backup(s) restored; ${results.filter((r) => r.ok).length} complete; schema ${breaks.length ? `${breaks.length} problem(s)` : "current"}`;
  console.log(JSON.stringify({ passed, summary, results, schemaProblems: breaks.slice(0, 20).map((i) => `${i.table}${i.column ? "." + i.column : ""}: ${i.detail}`) }, null, 2));
  console.log(passed ? "RESTORE DRILL PASSED" : "RESTORE DRILL FAILED");
  await prisma.$disconnect();

  // Record the result in production (System Health shows it).
  if (process.env.PRODUCTION_URL && process.env.CRON_SECRET) {
    const r = await fetch(`${process.env.PRODUCTION_URL.replace(/\/$/, "")}/api/health/restore-drill`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify({ passed, summary, detail: { results: results.map((x) => ({ ...x, backup: x.backup.replace(/^[^/]+\//, "…/") })), schemaProblems: breaks.length } }) }).catch(() => null);
    console.log(r?.ok ? "Result recorded in System Health." : `Could not record the result (${r?.status ?? "no answer"}).`);
  }
  process.exit(passed ? 0 : 1);
}
main().catch((e) => { console.error("RESTORE DRILL FAILED:", (e as Error).message); process.exit(1); });
