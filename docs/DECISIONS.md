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

## Small rules chosen while writing the hours and budget math (please confirm)

- Hours per entry must be more than 0, at most 24, with at most 2 decimals (e.g. 7.25).
- The daily flag triggers only **above** the threshold: exactly 8 hours is not flagged.
- A change order of exactly the threshold is **quick**; anything above is **large**.
  The starting threshold is 4 hours until the owner sets it.
- "Over budget" means any hours above 100%. Exactly 100% shows as "at budget".
- A quoted job with no budget hours but hours entered shows as over budget.
- Labor cost is rounded to the cent per entry. If an employee has no wage on file
  for a date, those hours are listed as "missing wage" and not guessed.
