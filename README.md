# OBE Curriculum Governance — Deployment Runbook

## What this is

A real Next.js application backed by a real PostgreSQL database. Currently implements,
end-to-end and for real:

- Secure login (Argon2id password hashing, account lockout after repeated failures, DB-backed sessions)
- Super User → creates Chairman accounts
- Chairman → creates Program Coordinator accounts
- Program Coordinator → onboards Subject Expert / Course Instructor accounts (temp password, forced change — the forced-change *screen* itself is the one piece left as a follow-up, see below)
- Program Coordinator → creates courses, either by hand or by **adopting directly from the seeded HEC BS Computer Science 2025 Master Curriculum**
- An audit log recording every account/course creation

**Not yet built:** the Subject Expert template builder, Faculty course delivery screens,
OMC review queue, and the forced "set new password" screen. Every one of those follows
the exact same recipe as the pages already built (see "Extending this app" below) — I
scoped this first deployable slice to the account/role backbone since everything else
depends on it being solid.

## The seeded HEC curriculum

`prisma/hec-bscs-2025.ts` contains the real, current BS Computer Science curriculum from
HEC's official notification **No. HEC/NCRC/CS&IT/2025/8163, dated 14 October 2025** —
extracted directly from the PDF you uploaded (not from memory). It includes:

- All courses across the 8-semester scheme (General Education, Major, IDS, electives,
  certification, capstone, field experience), with credit hours and semester placement
  exactly as published
- The 10 official Program Learning Outcomes (PLOs), verbatim from the document

**One caveat, stated plainly:** HEC's published scheme does not assign formal course
codes — universities assign their own. The `code` values in the seed file (`CS-101`,
`GE-101`, etc.) are a numbering convention I invented for this seed, clearly not part
of the official source. Replace them with your institution's actual course codes when
adopting.

The seed script (`prisma/seed.ts`) publishes this as a `MasterCurriculum` record on first
run. Program Coordinators can then adopt individual courses from it directly when
creating courses (see the "Adopt from HEC Curriculum" option on the Courses page) — each
adopted course keeps a `masterCourseId` link back to the source for traceability.

---

## Step 1 — Create a free Postgres database (Supabase)

1. Go to https://supabase.com and sign up (free tier is enough to start).
2. Create a new project. Pick any name/region; set a database password and **save it**.
3. Once the project is ready, you'll land on the project's dashboard. Click the
   **Connect** button (near the top of the page — Supabase moved this out of Settings
   in recent versions; it's no longer under Project Settings → Database).
4. In the panel that opens, choose the **URI** tab (or **Session pooler** if URI alone
   doesn't work for your network). Copy the connection string — it looks like:
   `postgresql://postgres.xxxxxxxxx:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`
5. Replace `[YOUR-PASSWORD]` with the database password you set in step 2.

(Neon.tech and Railway.app work identically if you prefer either of those instead.)

## Step 2 — Get the code onto GitHub

1. Create a new empty repository on GitHub.
2. Unzip this project locally, then from inside the folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

## Step 3 — Deploy to Vercel

1. Go to https://vercel.com and sign up with your GitHub account.
2. Click **Add New → Project**, select the repository you just pushed.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `DATABASE_URL` = the connection string from Step 1
4. Click **Deploy**. Vercel will run `npm install`, which triggers `prisma generate`
   automatically (see the `postinstall` script in `package.json`).

## Step 4 — Run the database migration

The database is empty until you create the tables. From your local machine, with the
same `DATABASE_URL` set:

```bash
npm install
echo 'DATABASE_URL="paste-your-connection-string-here"' > .env
npx prisma migrate deploy
npm run db:seed
```

The seed script creates the first Super User account:
- username: `superadmin`
- password: `ChangeMe123!`

**Change this password immediately** — either by adding a proper "change password" API
call, or directly in your database console for now, since the forced-change screen isn't
built yet (see "Not yet built" above).

## Step 5 — Connect your own domain (optional)

In Vercel: **Project → Settings → Domains → Add**, then follow Vercel's instructions to
point your domain's DNS at it. Vercel issues the HTTPS certificate automatically.

## Step 6 — Log in

Visit your Vercel URL (or your custom domain). Sign in as `superadmin`, create a
Chairman account, hand them their credentials, and the chain continues from there.

---

## Extending this app

Every remaining role screen follows the identical three-file pattern already used
throughout:

1. **`app/api/<role>/<thing>/route.ts`** — a route handler that calls
   `getAuthenticatedUser()`, checks `user.role`, then reads/writes via `prisma`.
2. **`app/<role>/<thing>/page.tsx`** — a server component that redirects if unauthenticated
   or wrong role, fetches data with `prisma`, and renders a table plus a form component.
3. **`components/<Thing>Form.tsx`** — a small client component that posts to the API route
   and calls `router.refresh()` on success.

Copy `app/coordinator/courses/` and its API route as the template for the next screen —
it's the simplest complete example of the pattern.

## Security notes already built in

- Passwords: Argon2id, never logged, never returned by any API response
- Sessions: random 256-bit token, only the SHA-256 hash stored in the database, HTTP-only
  cookie, 7-day expiry, revocable
- Login: generic failure message (doesn't reveal whether an account exists), temporary
  lockout after 8 failed attempts (not permanent — avoids denial-of-service via lockout)
- Every account-creation action is written to `AuditLog`

## Still needed before this is production-grade at the scale of the original spec

Multi-tenancy/RLS, background job processing, OCR/AI curriculum extraction, DOCX/PDF
report generation, MFA, and the remaining role screens are all real, separate pieces of
work — not implemented here. The `obe-platform-architecture-scaffold.zip` from earlier
in this conversation has the fuller schema and RLS policy design for when you're ready
to tackle multi-tenancy specifically.
