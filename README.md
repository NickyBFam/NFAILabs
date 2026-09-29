# NFAI Labs

NFAI Labs is being built as an AI intelligence, benchmarking, comparison, and recommendation platform. Its guiding question is: **"Which AI should I use for this task, why, and how should I use it?"**

The project is developed in strict phases. See [`docs/PHASES.md`](docs/PHASES.md) for the roadmap and current status, and [`AGENTS.md`](AGENTS.md) for the rules every contributor and coding agent follows.

> **Status:** Database and data architecture (Phase 2, accepted; validated on a real Supabase development project). Preview deployment: https://nfai-labs.vercel.app/. The site contains placeholder pages only. No model data, benchmark results, prices, or rankings are published, and no page reads the database yet.

## Requirements

- Node.js 22 LTS (`^22.13.0`) or Node.js 24+. The repository pins the major version in `.nvmrc`.
- npm (the lockfile is `package-lock.json`).

## Getting started

```bash
npm ci
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint (Next.js core-web-vitals and TypeScript rules). |
| `npm run typecheck` | Generate Next.js route types, then run `tsc --noEmit` in strict mode. |
| `npm test` | Run the Vitest test suite once, including database tests. |
| `npm run test:db` | Run only the database tests (`*.db.test.ts`) against an in-process PostgreSQL (PGlite). |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run format` / `npm run format:check` | Format or check code with Prettier. Markdown is excluded. |
| `npm run validate` | Run every check CI runs, in order. |

## Project structure

```
src/
  app/          Routes (App Router), root layout, metadata routes, error and not-found UI
  components/
    layout/     Site header, navigation, footer
    page/       Page-level building blocks (page header, placeholder sections)
    ui/         Small visual primitives (container, button link, card, badge)
  lib/          Configuration and pure helpers (site identity, product areas, metadata, env)
    data/       Typed data-access layer (Supabase clients, repositories, mappers, history queries)
  styles/       Global stylesheet and design tokens (Tailwind CSS v4)
  test/         Test setup, database test harness (db/), synthetic fixtures (fixtures/)
  types/        Database row types
supabase/       Local Supabase config, SQL migrations, synthetic seed
docs/           Product specification, architecture, database, methodology, phases, decisions
```

## Database

The schema lives in `supabase/migrations/` (PostgreSQL 17 on Supabase). See [`docs/DATABASE.md`](docs/DATABASE.md) for conventions and the schema map.

- **Tests need nothing extra.** `npm test` applies every migration to a fresh in-process PostgreSQL (PGlite) and checks constraints, history rules and Row Level Security. No Docker, network or credentials.
- **Optional local Supabase stack** (requires Docker): `npx supabase start`, then `npx supabase db reset` to rebuild from the migrations and `supabase/seed.sql`. `supabase start` prints the local URL and keys for `.env.local`.
- The seed contains synthetic, obviously fictional data only. Never apply it, or run resets, against a preview or production project. The one-time Phase 2 validation on a dedicated development project is described in [`docs/DATABASE.md`](docs/DATABASE.md) §8.

The list of product areas and navigation lives in `src/lib/product-areas.ts`. It is structural configuration only and must never contain product data.

## Environment variables

See [`.env.example`](.env.example). Copy it to `.env.local` for local overrides. `.env*` files other than `.env.example` are git-ignored.

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for canonical URLs, robots and sitemap. | Vercel production URL, then `http://localhost:3000` |
| `NFAI_ALLOW_INDEXING` | Set to `true` to allow search-engine indexing. | Off (`noindex`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. | Unset (no database access) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key; public by design, protected by RLS. | Unset |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS. Server-only; read only by `server-only` modules. | Unset |

Only `NEXT_PUBLIC_*` variables reach the browser. Never put secrets in them.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`: install (`npm ci`), lint, format check, typecheck, test (including the in-process database tests, with no secrets), and production build. There is no deployment automation yet.

## License

All rights reserved. See `docs/DECISIONS.md` (D-018).
