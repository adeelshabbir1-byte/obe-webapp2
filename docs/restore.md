# How to restore OBEHUB data

For the IT Manager. Read it once now, so you know where things are before you need them.

## What is backed up, and where

- **Every Sunday** the app makes one backup file per institute: every academic table of that institute (staff, batches, students, courses, plans, CLOs, enrolments, marks, attendance, results, transcripts, fees, alumni). Passwords are never in it.
- The files are kept in **Supabase → Storage → bucket `institute-backups`** (private), one folder per institute. The last 8 weeks are kept.
- The Institute Head can also make a backup any time: **Settings → Backups → Download a backup now**.
- Supabase itself also keeps daily database backups (Supabase dashboard → Database → Backups). Use those only if the whole database is lost.

## Restoring rows that were deleted by mistake (most common)

1. Sign in as the **Institute Head** (or the Super Admin).
2. Open **Backups**, choose the backup from **before** the mistake, and press **Check (dry run)**. Nothing changes yet: you see, table by table, how many rows are present and how many would come back.
3. If the numbers look right, press **Restore missing rows**. Only rows that are missing come back — nothing that exists is overwritten.
4. Restored staff get the temporary password `12345678` and must change it at their next sign-in. Restored students activate their account again.
5. Check a few pages (a course, a student's transcript). The restore is written to the audit log.

## Restoring the whole database (disaster)

1. In the **Supabase dashboard → Database → Backups**, choose the latest good point and restore it (or restore into a new project and point the app at it).
2. If you used a new project: in **Vercel → Project → Settings → Environment Variables**, change `DATABASE_URL` (and `DIRECT_URL` if set) to the new database, using the **pooler** address (port 6543, `?pgbouncer=true&connection_limit=1`), then **Redeploy**.
3. Open **System Health** in the app. If it lists anything missing, copy the fix script, run it in **Supabase → SQL Editor**, and press **Check again**.
4. If some days of data are missing, use the institute backups (above) to bring back missing rows.

## The monthly restore test

- On the 1st of every month, GitHub Actions restores the latest backups into a **separate scratch database** and checks them (row counts of the key tables, one student's transcript, and that the database matches the app). The live database is never touched.
- The result shows in **System Health → Last restore test**. If it says **failed**, open GitHub → Actions → *Restore drill* to see why, and tell the developer.
- To run it now: GitHub → Actions → *Restore drill* → **Run workflow**.
- It needs these repository secrets (GitHub → Settings → Secrets and variables → Actions): `RESTORE_TEST_DATABASE_URL` (a separate empty Postgres, e.g. a free Supabase project — never the live one), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and the variable `PRODUCTION_URL`.

## Who to call

- App problems: the developer (see the repository's README).
- Supabase account: whoever owns the Supabase project (Adeel).
- Vercel account: whoever owns the Vercel project (Adeel).
