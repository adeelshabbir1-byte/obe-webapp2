# Speed and testing

## Speed
- Vercel functions run in Tokyo (`hnd1`, vercel.json), next to the Supabase database — keep both in the same region.
- `prisma/migration_speed.sql` adds the indexes large institutes need (roll-number / name type-ahead with pg_trgm, offered courses, transcript and enrolment lookups).
- Heavy pages are pre-computed: the head dashboards nightly (cron), outcome-flow for 5 minutes per batch.
- Imports write in chunks of 500 rows; backups and restores in chunks of 300–1,000.

## Scale test (10,000+ students)
Run against a copy or branch of the database:

    DATABASE_URL=<copy> npx tsx scripts/scale-test.ts 10000

It creates a throw-away institute (20 batches, N students, 20 transcript rows each), times type-ahead search, batch
lists, CGPA and standing lists, then deletes everything it made.

## Automated tests
    npm test

Core calculations covered: grading and CGPA (best attempt), attendance, exam planning, FYP, accreditation governance,
data-import column matching and heading detection, merit positions, backup reading and restore order, sign-in
throttling, GA coverage for labs.

## Real-data testing round (pilot institute)
1. Import the pilot's students, faculty, rooms and two years of past transcripts with Data Import (dry run first).
2. Compare 20 students' CGPA and degree audit with the university's own records; note every difference.
3. Run one semester's allocation, timetable, exam session, debarred list and result publication end to end.
4. Take a backup, delete one test batch, Check and Restore missing rows.
5. Log issues in the Help Desk with the tag PILOT.
