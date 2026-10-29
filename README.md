# Flowboard

A small team Kanban board built with React, TypeScript, Vite and Supabase.

## Setup
1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. `npm install`
3. `npm run dev`

## Scripts
- `npm run dev` – start the dev server
- `npm run build` – type-check and build
- `npm run lint` – lint with oxlint

## Features
Drag or "Move to" cards between columns, search, undo on delete, light/dark theme, keyboard and mobile friendly.

## Testing
- `npm test` runs the whole suite once (Vitest + React Testing Library). `npm run test:watch` re-runs on save.
- `npm run ci` is what the pipeline runs: lint, tests, then the production build.
- Supabase is always mocked (`src/test/`), and network access is blocked in tests, so running them never touches a real database.
- The suite covers creating, editing, moving and deleting cards, plus regression tests for the accessibility, security and SEO fixes (including checks on `index.html`, `vercel.json` and the row-level-security migration in `supabase/migrations/`).

### Automatic checks
- **GitHub Actions** (`.github/workflows/ci.yml`) runs lint, tests and build on every push to `main` and on every pull request.
- **Vercel** runs `npm test && npm run build` (see `buildCommand` in `vercel.json`), so a failing test blocks the deploy, including `vercel deploy` from the command line.
