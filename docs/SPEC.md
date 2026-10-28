# WCOI Job Tracker: Product and Technical Specification

Prepared for World Class Office Installers, Inc. · October 26, 2026 ·
Version 1.0 (draft for review)

## 1. Purpose

World Class Office Installers (WCOI) installs, moves, and removes office
furniture. Today, work orders are printed and kept in a file drawer,
hours are written down three separate times (on the work order, on a
daily job sheet, and on each employee’s weekly timesheet), and the
bookkeeper reconciles all three by hand.

This app replaces that paper process. Job leads use shared tablets to
view work orders and drawings, record employee hours, submit change
orders and punch lists, and upload photos. The app tracks hours against
budget and connects to QuickBooks so that work orders flow in and hours
flow out. It is the one place where everything about a job lives.

**Goals**

- Enter hours once, in one place. Daily job sheets and weekly timesheets
  are generated from that single entry.

- Show how each quoted job stands against its budgeted hours and labor
  cost, close to live.

- Give the bookkeeper one reliable hours number per job for invoicing
  and payroll.

- Replace the paper file drawer for work orders, drawings, punch lists,
  and photos.

- Keep employee wages hidden from job leads.

## 2. Notes for Claude Code (the builder)

The person building this has no prior coding experience. Please:

- Work in small steps. Build one feature, run it, test it, commit it,
  then move to the next.

- Explain what you did and what could go wrong in plain language. Ask
  before making assumptions that change how the app behaves.

- Use Git from the first day and commit after each working step.

- This app drives payroll and customer invoices. Write automated tests
  for all hours, budget, cost, permission, and sync logic before relying
  on it (see section 11).

- Use fake employees, jobs, and customers during development. Do not
  load real payroll data until the app has been tested.

- Never put secrets (QuickBooks keys, database keys) in code or in Git.
  Use environment variables.

- Enforce permissions on the server and database, not only in the
  screens. Hiding a wage field in the interface is not enough.

- Before starting each phase, check section 14 and tell me which open
  questions affect that phase. For anything in section 14 that you can’t
  answer by testing, stop and ask me instead of assuming

- Read section 13 (assumptions) and section 14 (open questions) before
  starting, and raise anything that blocks a decision.

- For Phase 4, test questions 2 and 3 from section 14 in the Intuit
  sandbox and report what it finds before building anything around them.

## 3. Current process (context)

1.  The owner gives the bookkeeper a quote. The bookkeeper creates the
    quote in QuickBooks, which is then converted into a work order in
    QuickBooks. The work order is printed and filed by date.

2.  Each day, the owner writes the day’s jobs and crews on a whiteboard
    in the break room.

3.  The job lead finds their job on the whiteboard, pulls the matching
    work order file (with drawings and instructions), calls the on-site
    contact, and does the job. Jobs include moving existing furniture,
    receiving and installing new furniture, tearing down and removing
    old furniture, and relocating furniture between buildings.

4.  Each day the lead writes who worked and for how many hours on the
    work order, and fills out a daily job sheet listing each employee’s
    hours. Employees also fill out weekly timesheets (work order number,
    location, hours).

5.  When the job ends, the customer signs the work order and the lead
    turns it in. The bookkeeper compares the work order, the daily logs,
    and the employee timesheets.

6.  All hourly rates and employees are set up in QuickBooks. Payroll is
    run in QuickBooks. Hours are checked at the time of invoicing.

7.  Punch lists are a form with job site information and item details.
    Photos are sent to the owner, who relays them to the right people.

## 4. Users, sign-in, and permissions

**Roles:** Job lead, Bookkeeper/office manager, Owner. Regular employees
do not log in. Job leads enter hours for everyone on their crew, so
employees never need phone data or a login.

**Sign-in:** Tablets are shared. Whoever is leading a job picks up a
tablet and signs in with their own name and PIN. The app then shows only
that person’s assigned jobs. Use PIN lockout after repeated failures and
automatic lock after a period of inactivity. Every action is recorded
under the signed-in person.

| Action                                        | Job lead                            | Bookkeeper      | Owner           |
|-----------------------------------------------|-------------------------------------|-----------------|-----------------|
| View work orders                              | Own assigned jobs only              | All             | All             |
| Create and edit work orders                   | No                                  | Yes             | Yes             |
| Assign leads and employees to jobs            | Add or remove employees on own jobs | Yes             | Yes             |
| Enter hours                                   | Yes, own jobs                       | Yes             | Yes             |
| Edit hours                                    | Until the work order is turned in   | Always (logged) | Always (logged) |
| See wages and dollar labor cost               | No                                  | Yes             | Yes             |
| Upload photos, fill in punch lists            | Yes                                 | Yes             | Yes             |
| Submit quick change orders                    | Yes                                 | Yes             | Yes             |
| Approve large change orders                   | No                                  | No              | Yes             |
| Approve hourly-job hours for billing          | No                                  | Yes             | Yes             |
| Admin settings (employees, rates, thresholds) | No                                  | Yes             | Yes             |

The owner can view all job site data for every lead.

## 5. Core concepts and data

The developer should refine field names, but the following records are
needed.

- **Employee:** name, active flag, QuickBooks employee ID, hourly wage
  (effective-dated, so a raise does not change past labor cost). Wages
  are visible only to bookkeeper and owner.

- **User login:** links a person to a role (lead, bookkeeper, owner) and
  a hashed PIN.

- **Work order:** QuickBooks ID, quote number, PO number, date, status,
  job type (**hourly** or **quoted**), Bill To (company, contact,
  phone), Ship To (company or customer, address, on-site contact,
  phone), turn-in date, customer signature.

- **Work order line:** description, quantity, and whether it is a labor
  line. For labor lines, the quantity is the budgeted hours. Non-labor
  lines (for example, a fuel surcharge) are stored but excluded from the
  budget.

- **Job assignment:** work order, lead, crew (employees), and date or
  dates.

- **Time entry:** work order, employee, date, hours, entered by, created
  and edited timestamps, sync status. Hours are logged against the whole
  work order, not per section.

- **Change order:** work order, type (quick or large), hours added,
  description, requested by, status (pending, approved, denied),
  approved by.

- **Punch list item:** work order, description and details, status,
  notes.

- **Photo:** work order, optional punch list item, file, taken by,
  timestamp.

- **Document:** work order, file (PDF or image), kind (drawing,
  printout, email, other). Phase 2 adds markup layers.

- **Audit log:** who changed what, when, old and new value. Required for
  any edit to hours or approvals.

- **Settings:** daily-hours flag threshold (default 8),
  large-change-order threshold in hours, reminder percentages (default
  50 and 80), and who receives reminders.

**Calculations**

- Budget hours (quoted jobs) = sum of labor line quantities + approved
  change order hours.

- Hours used = sum of time entries for the work order.

- Percent used = hours used ÷ budget hours.

- Labor cost = sum of (entry hours × the employee’s wage in effect on
  the entry date).

- All of these are unit-tested. Overtime is ignored for now, but the
  data design must allow overtime rules to be added later without a
  rebuild.

## 6. Features

### 6.1 My jobs

After sign-in, a lead sees their assigned jobs for today first, then
upcoming and past jobs. This replaces the whiteboard and file drawer
lookup. Each job card shows customer, ship-to address, job type, and
budget status (for quoted jobs). The owner and bookkeeper can see all
jobs and assign leads and crews by date. A full digital scheduling board
is not required in version 1.

### 6.2 Work order screen

Shows everything about one job in one place: header details, both
contacts (the on-site Ship To contact prominently, with tap-to-call),
line items, documents, hours, change orders, punch list, photos, and
turn-in status.

### 6.3 Hours entry

- The lead sees the crew on the job and can add or remove employees. An
  employee who works two jobs in one day is added to both.

- For each employee and day, the lead enters hours only. No start or
  stop times, no categories, no special rules.

- Entering hours generates the daily job sheet automatically, and the
  employee’s weekly totals.

- **Daily hours flag:** if one employee’s total across all jobs for a
  day exceeds the threshold (default 8), show a soft warning. The lead
  can confirm the hours are correct and continue. The warning does not
  block saving, and the owner can change the threshold.

- Leads never see wages or dollar amounts.

### 6.4 Budget tracking (quoted jobs)

For quoted jobs, show hours used against budgeted hours and the labor
cost so far (owner and bookkeeper only). Send reminders when usage first
reaches 50% and 80% of budget. Reminders go to the owner and bookkeeper,
and the lead sees an on-screen indicator without dollar figures. Show a
clear over-budget status above 100%, because going over means losing
money. Budget history should be kept so the app can later report budget
vs. actual by job, customer, and type of work.

### 6.5 Hourly jobs

Hourly jobs are billed for actual hours worked at one labor rate, the
same for every employee, which is stored in QuickBooks. For these jobs
the app records hours, shows the total, and does not show budget alerts.
When the lead turns the job in, the hours go to a **bookkeeper review
screen**. Nothing is sent to QuickBooks until the bookkeeper approves.
The review screen shows total hours with a breakdown by employee and by
day, replacing her three-way comparison. After approval, the total hours
are sent to QuickBooks for invoicing. The lead can show the customer the
hours summary on the tablet and capture their signature there.

### 6.6 Turn-in and locking

When a job is finished, the lead captures the customer’s signature on
the tablet and turns in the work order together with its punch list.
After turn-in, the lead can no longer edit hours. The bookkeeper and
owner can still edit, and every edit is logged. The lead should see
clearly whether a job is open, turned in, approved, or sent.

### 6.7 Change orders

- **Quick change:** a short form for a change that needs no approval.
  The extra hours are added to the job budget automatically.

- **Large change:** the lead submits the details, and the owner is
  notified. The budget does not change until the owner taps approve in
  the app (or deny). A threshold in hours, set by the owner, decides
  which type applies.

- Both types stay attached to the job. The budget view shows original
  hours plus approved changes.

- The salesperson belongs to the furniture seller, not WCOI, and is not
  part of the app. The owner contacts them directly.

### 6.8 Punch list

A form with the job site information and a list of items, each with
details and its own photos. It is submitted along with the work order at
turn-in. The owner sees all items and photos in one place and can share
them with whoever needs them (sharing outside the app, such as email, is
acceptable for version 1).

### 6.9 Documents and markup

- Drawings range from standard sheets to extended sheets to large-format
  blueprints, plus printouts and emails. Store them as PDFs or images
  attached to the work order.

- Smooth pinch-to-zoom on the tablet is required, because older workers
  need to read plans clearly. Prefer PDF uploads when plans arrive as
  PDFs, as they give the sharpest zoom.

- Paper drawings must be scanned or photographed in. Large-format plans
  may need a scanning service.

- **Phase 2:** highlight and draw on documents. Markup is saved as a
  separate layer over the original, so the original is never altered.
  When finished, the app asks whether to save the markup as a new copy
  or discard it. Markup is shared per job.

### 6.10 Photos

Leads take about 1 to 10 photos per job. Job photos are tied to the work
order, not to a day. Punch list photos are tied to a specific item.
Compress photos on the tablet before upload to save time and data.

### 6.11 Admin screens

For the bookkeeper and owner: manage employees and wages (if wages
cannot be read from QuickBooks), manage users and PINs, set thresholds,
assign jobs, and mark job type.

### 6.12 Reports and exports

- Per-work-order hours summary by employee and by day.

- Weekly hours per employee across all jobs, for payroll (section 7).

- Quoted jobs: budget vs. actual hours and labor cost.

- Over-threshold daily-hours flags and edit history.

## 7. QuickBooks integration

Work orders, employees, and rates all live in QuickBooks today. The
company is currently on QuickBooks Desktop and plans to move to
QuickBooks Online. **Build only for QuickBooks Online.** Do not build a
Desktop integration. Develop and test against Intuit’s free developer
sandbox, and connect the live company after the migration.

**Into the app**

- New work orders (created in QuickBooks from quotes): customer, Ship To
  and Bill To details and contacts, PO number, quote number, and lines
  with quantities. Labor-line quantities become budgeted hours. Use
  webhooks for new records, with a periodic “changes since” query as a
  backup.

- Employees and, if available, hourly pay rates. If the API does not
  expose pay rates, they are entered once in the app’s admin screen.

**Out of the app**

- **Hourly jobs:** total approved hours for the work order, so
  QuickBooks can apply the labor rate on the invoice. The mechanism
  (billable time entries or a quantity on an invoice line) must be
  tested in the sandbox before building around it.

- **Payroll:** weekly total hours per employee across all jobs, reviewed
  by the bookkeeper before sending.

- **Quoted jobs:** nothing job-level is sent. Budget vs. actual is for
  the app’s own analytics.

**Technical notes**

- Use Intuit’s OAuth sign-in. Access tokens expire after about an hour,
  so refresh them automatically. Store credentials securely.

- Respect rate limits and retry politely on errors.

- Intuit introduced tiered API pricing in 2025, and some features (such
  as Projects and time with payroll) are premium. Check the current
  tiers and what this app’s usage would cost before relying on specific
  endpoints.

- Intuit must approve the app before it can connect to the live company.
  Plan time for that review.

- Log every sync and every failure so the bookkeeper can see what was
  sent.

## 8. Offline use and sync

Tablets use cellular data, but job sites such as basements and new
buildings can lose signal. The app must work fully offline and sync
automatically.

- Save every entry on the tablet immediately (a local database such as
  IndexedDB) and show it as “not synced” until the server confirms it.

- Sync when the app opens, when the connection returns, and on a timer
  while the app is open. Do not rely on the browser’s Background Sync
  feature, because iPad browsers do not support it reliably.

- When a lead signs in, download their assigned jobs, work order
  details, and documents in advance so they open with no signal.

- Unsynced entries belong to the person who made them. Signing out must
  never delete unsynced data, and the app should warn if unsynced data
  exists.

- Conflicts: time entries get a unique ID on the device. If a lead’s
  offline edit conflicts with a later bookkeeper edit, do not silently
  overwrite. Flag it for review.

- A fallback must exist: if a tablet has no cellular service, it syncs
  at the shop on Wi-Fi.

## 9. Devices, hosting, and recommended stack

**Devices:** 5 tablets in total, rolled out as 2 first. Recommended:
11-inch iPads with cellular, added to the company’s existing Verizon
account (confirm current business tablet plans). Rugged cases are
required. Tablets are company-owned and shared, so there is no phone
data reimbursement for employees.

**Recommended stack** (Claude Code may propose alternatives if it
explains why):

- A Progressive Web App (a web app installed to the tablet’s home
  screen), built with Next.js and React.

- Supabase for the database (Postgres with row-level security), user
  accounts, and file storage.

- Vercel for hosting.

- A PDF viewer with pinch-zoom support, and client-side photo
  compression before upload.

- Automated nightly database backups.

## 10. Security and privacy

- Wages, labor cost, and billing data are returned only to bookkeeper
  and owner accounts, enforced in the database and API.

- A lead can read and write only data for their assigned jobs.

- PINs are hashed, never stored in plain text. Lock out after repeated
  failures and auto-lock on inactivity.

- All traffic uses HTTPS. QuickBooks tokens are encrypted at rest.

- Employee names, hours, and pay are sensitive. Do not log them in error
  reports or analytics.

- Before go-live, request a security review of the finished app, ideally
  by an outside developer or IT consultant for a few hours.

## 11. Testing requirements

- Hours math: daily and weekly totals, a job’s hours used, percent used,
  budget with change orders, labor cost with a wage change mid-job.

- Flags and reminders: over-threshold daily hours across multiple jobs,
  50% and 80% reminders firing once each.

- Permissions: a lead cannot see wages, other leads’ jobs, or edit after
  turn-in; bookkeeper and owner edits are logged.

- Offline and sync: entries made offline sync correctly, nothing is lost
  on sign-out, conflicts are flagged.

- Budget and hourly flows: bookkeeper approval blocks sending to
  QuickBooks until approved.

- **Real-world check:** before relying on the app, enter several past
  jobs and compare its totals to the bookkeeper’s reconciled hours.

## 12. Build phases

**Phase 0: Setup.** Accounts (database host, web host, Intuit
developer), Git repository, this spec saved in the project, fake test
data.

**Phase 1: Core app without QuickBooks.** Sign-in with PINs and roles,
manual work order entry, job assignment, “my jobs,” hours entry with the
daily flag, budget tracking and reminders, turn-in and locking,
bookkeeper review, audit log, hours summaries. Automated tests.

**Phase 2: Documents, photos, and forms.** Document upload with zoom,
photos, punch lists, change orders, customer signature capture.

**Phase 3: Offline and sync.** Full offline operation and background
syncing, tested with airplane mode.

**Pilot.** Two tablets with two or three job leads. Run alongside paper
for several pay periods and compare totals against the bookkeeper’s
reconciled hours. Fix what the leads find confusing.

**Phase 4: QuickBooks sandbox integration.** Import work orders and
employees, send hourly-job totals and weekly payroll totals, all against
the sandbox.

**Phase 5: Go-live.** After the migration to QuickBooks Online and
Intuit’s approval, connect the live company. Run in parallel with the
current process for a few pay periods. Roll out to all 5 tablets.

**Phase 6: Markup and analytics.** Drawing and highlighting on
documents, and budget vs. actual reports.

## 13. Assumptions to review

These are defaults chosen where the answer was not specified. Please
confirm or change.

1.  Leads see only jobs assigned to them.

2.  Edits to hours by the bookkeeper or owner are recorded with who,
    when, and the old and new value.

3.  The line between quick and large change orders is a threshold in
    hours set by the owner.

4.  Only the owner approves large change orders, by tapping approve or
    deny in the app.

5.  Change orders do not need a customer signature. The work order
    itself does.

6.  Budget reminders at 50% and 80% go to the owner and bookkeeper.
    Leads see an indicator without dollars. An over-budget status is
    shown above 100%.

7.  The daily-hours flag is per employee, per day, across all jobs, is a
    soft warning, and its threshold (default 8) is adjustable.

8.  Hourly jobs have no budget alerts.

9.  Leads enter hours daily. Weekly totals per employee go to payroll
    after the bookkeeper reviews them.

10. Employee wages are stored with effective dates so raises do not
    change the labor cost of past jobs.

11. Markup is shared per job and saved as a separate layer, with an
    option to save a new copy.

12. Basic job assignment by date replaces the whiteboard. A full
    scheduling board is later.

13. Tablets are cellular iPads with individual PINs, on the company
    Verizon account.

14. Photos are compressed before upload.

15. Include a notes field the owner can add onto the work order for
    special instructions.

16. Payroll starts on Monday, and checks are cut every other week on
    Wednesday.

17. Hourly and quoted jobs are distinguished through whether there are
    qty listed on the work order.

18. Verizon business plan currently charges \$30 per tablet for an
    unlimited line.

## 14. Open questions to verify

1.  After the move to QuickBooks Online, does the quote-to-work-order
    conversion still work the same way, and what type of QuickBooks
    record is the work order (estimate, sales order, or other)?

2.  Does the QuickBooks Online API expose employee pay rates, or must
    rates be entered in the app?

3.  How are hours best added to an hourly invoice: billable time entries
    or a quantity on an invoice line?

4.  Which QuickBooks payroll product will be used after migration, and
    how should weekly hours reach it?

5.  What does Intuit’s current API pricing tier mean for this app’s
    usage?

## 15. Out of scope for now

- Overtime rules (the data design must allow adding them later).

- Start and stop times, breaks, or hour categories.

- Splitting hours by work order section.

- Salesperson or customer logins and outside notifications.

- A full digital scheduling board.

- Employee-facing logins.

- A Desktop version of the QuickBooks integration.
