# WCOI Job Tracker

Tablet app for World Class Office Installers: work orders, crew hours, budgets,
change orders, punch lists, photos, and (later) QuickBooks Online sync.

- Full spec: [docs/SPEC.md](docs/SPEC.md)
- Decisions on open questions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Status

| Phase | What | Status |
|-------|------|--------|
| 0 | Setup: repo, spec, fake data, tests | Done (accounts pending) |
| 1 | Core app (sign-in, jobs, hours, budgets, turn-in) | Hours and budget math done |
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
npm run build    # check the app builds
```

## Rules

- Development uses **fake** data only (`src/dev/fake-data.ts`).
- Secrets go in `.env.local` (never committed). See `.env.example`.
