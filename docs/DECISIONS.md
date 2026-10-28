# Decisions

Answers to the questions raised before Phase 0 (spec sections 13 and 14).
Approved by the owner on 2026-10-28 ("use your suggestions").

| # | Question | Decision |
|---|----------|----------|
| 1 | Hourly vs. quoted jobs (assumption 17 vs. 6.11) | Auto-detect: a work order with labor-line quantities is **quoted**; otherwise **hourly**. Non-labor lines (e.g. fuel surcharge) are ignored. The bookkeeper or owner can override the type. |
| 2 | Signing in with no signal | Each tablet keeps a hashed copy of the PIN of every lead who has signed in on it online before. Offline sign-in checks that copy. Lockout still applies on the tablet. |
| 3 | How alerts reach owner and bookkeeper | Email plus an in-app badge (budget 50%/80%, over budget, large change orders). |
| 4 | Re-firing budget reminders | A reminder fires once per budget level. If the budget changes (e.g. approved change order) and usage drops below a level, that level can fire again. |
| 5 | Change orders on hourly jobs | Allowed as a record. They do not change any hours or budget. |
| 6 | Payroll period | Weeks run Monday–Sunday. A pay period is two weeks; checks are cut the Wednesday after. The bookkeeper reviews and sends hours the Monday after the period ends. |
| 7 | Daily hours flag while offline | Checked on the tablet with the hours it knows about, and re-checked on the server after sync. |

## QuickBooks items to verify in Phase 4 (sandbox)

- Q1: Which QuickBooks Online record replaces the work order (likely Estimate).
- Q2: Whether pay rates are available through the API (expected: no; enter in admin screen).
- Q3/Q4: Whether billable time entries (TimeActivity) can serve both invoicing and payroll.
- Which QuickBooks item(s) count as labor lines.

## Hours and budget rules (confirmed by the owner on 2026-10-28)

- Hours per entry must be more than 0, at most 24, in half-hour steps (2, 2.5, 3, ...).
- The daily flag triggers only **above** the threshold: exactly 8 hours is not flagged.
- A change order of exactly the threshold is **quick**; anything above is **large**.
  The starting threshold is 4 hours until the owner sets it.
- "Over budget" means any hours above 100%. Exactly 100% shows as "at budget".
- A quoted job with no budget hours but hours entered shows as over budget.
- Labor cost is rounded to the cent per entry. If an employee has no wage on file
  for a date, those hours are listed as "missing wage" and not guessed.

## Database choices (Phase 1, 2026-10-28) – to confirm with the owner

- **One hours entry per employee, per job, per day.** A second entry for the same
  employee, job, and day is refused; the existing entry is edited instead. This stops
  hours being counted twice when two tablets sync. Two jobs on the same day are fine.
- **PINs are exactly 6 digits and unique** (changed from 4 to 8 digits; see "Sign-in
  screen" below). The screen auto-locks after 5 minutes of no use (in settings).
- **Only the owner can create, edit, or set the PIN of an owner account.** The
  bookkeeper manages leads and other bookkeepers.
- **Leads can see crew names and each employee's total hours for a day** (all jobs),
  so the daily 8-hour flag works when a crew member also worked another lead's job.
  They never see wages, other leads' jobs, or which job those other hours were on.
- **Quick change orders cannot be denied later**: they are approved on submit. The
  owner approves or denies large ones. Once submitted, a change order's hours cannot
  be rewritten.
- Punch lists, photos, and documents get their tables in Phase 2.

## Sign-in screen (Phase 1, 2026-10-28) – to confirm with the owner

- **PIN only, no name list** (owner's choice). Each person's PIN is unique, so it
  says who they are. To make guessing impractical on a public web address:
  - PINs are exactly 6 digits (about 1 in 100,000 per guess with ~10 people).
  - 5 wrong PINs on a tablet blocks that tablet for 15 minutes; other tablets keep
    working. One internet address gets 20 wrong tries (shop Wi-Fi is shared).
  - More than 30 wrong PINs in an hour across all tablets pauses PIN sign-in for
    everyone until the hour passes. The 30 is in settings.
  - Because PINs are unique, the office may be told "that PIN is already taken"
    when setting one. That is expected.
- **Auto-lock signs the person out** on that tablet and returns to the name list,
  with a note saying why. (Phase 3 must keep unsynced entries when this happens.)
- **Offline sign-in (decision 2) comes in Phase 3** with the rest of offline mode.
  Until then, signing in needs a signal.

## My jobs screen (Phase 1, 2026-10-28) – to confirm with the owner

- **Jobs are grouped by the days they are scheduled**: Today, Upcoming, Past, and
  (office only) Not scheduled. A job that ran earlier and has more days later counts
  as upcoming. Leads see only the days they lead.
- **"Customer" on a card is the Ship To company** (where the crew goes), falling back
  to Bill To. Quoted jobs show hours used vs. budget hours; hourly jobs show hours
  entered. No dollars on this screen for anyone.
- **Today uses the company's time zone**, set by `COMPANY_TIME_ZONE`
  (default `America/New_York` — confirm).
- **Past jobs show the 20 most recent.** Search for older jobs can come later.
