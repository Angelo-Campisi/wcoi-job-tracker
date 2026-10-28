# WCOI Job Tracker

Tablet app for World Class Office Installers: work orders, crew hours, budgets,
change orders, punch lists, photos, and (later) QuickBooks Online sync.

- Full spec: [docs/SPEC.md](docs/SPEC.md)
- Decisions on open questions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Status

| Phase | What | Status |
|-------|------|--------|
| 0 | Setup: repo, spec, fake data, tests | Done (accounts pending) |
| 1 | Core app (sign-in, jobs, hours, budgets, turn-in) | Hours/budget math, database, PIN sign-in, My Jobs, Work Order, and hours entry done |
| 2 | Documents, photos, punch lists, change orders | Not started |
| 3 | Offline and sync | Not started |
| 4 | QuickBooks sandbox | Not started |
| 5 | Go-live | Not started |
| 6 | Markup and analytics | Not started |

## Commands

```bash
npm install      # first time only
npm run dev      # run the app at http://localhost:3000
npm test         # run automated tests
npm run test:db  # run database permission tests (needs TEST_DATABASE_URL, below)
npm run build    # check the app builds
```

## Database (Supabase)

Everything about the database lives in `supabase/`:

- `migrations/` – the tables, permission rules, and audit log. Changes are made by
  adding a new migration file, never by editing the database by hand.
- `seed.sql` – the same **fake** data as `src/dev/fake-data.ts`. Dev PINs:
  lead A 111111, lead B 222222, bookkeeper 777777, owner 888888.
- `tests/` – automated tests that sign in as each role and check what they can
  and cannot see or change.

Permissions are enforced inside the database (row-level security), not just in
the screens: leads see only their assigned jobs and never see wages, leads cannot
edit hours after turn-in, only the owner approves large change orders, and every
change to hours, approvals, wages, and users is written to `audit_log`.

**Connect the real Supabase project (one time):**

1. Create a project at supabase.com. Save the database password somewhere safe.
2. Copy the project URL, anon key, and service role key into `.env.local`
   (Project Settings → API).
3. Load the tables, then the fake data:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --include-seed
```

Leave out `--include-seed` once the project holds real data.

4. Turn off public sign-ups (Authentication → Sign In / Providers → "Allow new users
   to sign up" off). The app creates each person's login itself at their first
   PIN sign-in; nobody else should be able to create one.

## Sign-in

Shared tablets: enter your 6-digit PIN; it says who you are (`src/app/sign-in/`).
PINs are unique, set by the office. The server checks the PIN in the database
(`sign_in_with_pin`), which blocks a tablet after 5 wrong tries and pauses PIN
sign-in system-wide after too many wrong tries in an hour. It then opens a Supabase
session for that person. The PIN never goes anywhere but the server.
The screen locks after the idle time in settings (`src/components/InactivityLock.tsx`).

## My jobs

The home screen (`src/app/page.tsx`): today's jobs first, then upcoming, then past.
Leads see only their assigned jobs; the bookkeeper and owner see all jobs. "Today"
uses `COMPANY_TIME_ZONE` (default `America/Chicago`, Omaha). In development, add
`?today=2026-11-03` to the address to see the fake November jobs as "today".

## Work order screen

Tap a job to open it (`src/app/jobs/[id]/`): status, special instructions, on-site
contact with a Call button, budget or hours total, hours by day (with the daily
hours flag across all jobs), change orders, line items, and turn-in. Labor cost in
dollars shows only for the bookkeeper and owner. Leads get "not found" for jobs
that aren't theirs. Change order forms and turn-in come next.

## Hours entry

From a work order, tap **Enter hours** (`src/app/jobs/[id]/hours/`). One day at a
time, each crew member gets big − / + buttons: + starts at 8, each tap is half an
hour. Leads can add people to the crew and remove anyone with no hours on the job.
If someone goes over 8 hours in a day across all jobs, the lead is asked to confirm
before saving (it never blocks). Each row also shows that person's other-job hours
that day and their Monday–Sunday week total. No hours for future days. After
turn-in, leads can't change hours; the bookkeeper and owner can, and it's logged.

**Run the database tests locally** against any throwaway Postgres server
(the test creates and replaces a database named `wcoi_db_test`):

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm run test:db
```

## Rules

- Development uses **fake** data only (`src/dev/fake-data.ts`).
- Secrets go in `.env.local` (never committed). See `.env.example`.
