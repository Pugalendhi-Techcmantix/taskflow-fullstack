# TaskFlow — rules for Claude Code

Project management app (React + TypeScript, Express, Prisma, PostgreSQL) built for a client's
frontend engineering playbook (`../Frontend.pdf`). The project plan is imported below and loads
with this file in every session:

@PLAN.md

## At the start of every session

Before doing anything else:
1. Read the **Status** table in PLAN.md and find the module that is in progress (⏳ or 🧪), or the next one not started (⬜).
2. Tell the user in 2–3 lines: the current module, what is done, and what comes next.
3. If the user's request would skip ahead of the current module, point that out before starting.

## Workflow (always)

1. Work on **one module at a time**, in the order in `PLAN.md`. Never start the next module until the user approves the current one.
2. Before coding a module, show a short plan (tables, endpoints, screens) and wait for the user's OK.
3. A module is finished only when it meets every item of **Definition of done** in `PLAN.md`.
4. After the user approves: update the Status table in `PLAN.md`, then commit (one commit per module).
5. Record any new technical decision in the **Decisions log** in `PLAN.md`.
6. If something is unclear (business rules, wording, scope), ask. Never invent requirements.

## Environment

- Windows 11, Node 24, **npm workspaces** (do not use pnpm or yarn).
- **Local PostgreSQL 19 on port 5433, managed with pgAdmin 4. Do not use Docker.**
  - One database: `taskflow`. The connection string is in `apps/api/.env` (git-ignored). Never print or commit it.
  - **No test database.** Tests use in-memory repositories with dummy data (`apps/api/test/support`).
- Ports: API **4100**, web **5200**. Ports 4000 and 5173 belong to another project; never stop its containers.
- **The user runs `npm run dev` in their own VS Code terminal** so they can see the API logs. Don't leave dev servers running in a hidden background shell. If one is needed for browser checks, start it, check, then stop it and free ports 4100 and 5200. If the user's own server is already running on those ports, use it instead.
- Prisma is pinned to **7.10.1**. Do not upgrade to Prisma 8 (still a release candidate) unless the user asks.

## Commands (run from `taskflow/`)

| Command | Use |
|---|---|
| `npm run dev` | API on :4100 and web on :5200 |
| `npm run db:migrate` | `prisma migrate dev` against the dev database |
| `npm test` | All tests (in-memory, no database needed) |
| `npm run typecheck` | Strict TS in every package |

## TypeScript rules (rubric: Type Safety)

- `strict` + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax`.
- **No `any`, no `@ts-ignore`, no unsafe `as` casts.** Use type guards or Zod instead.
- No `enum`, `namespace` or constructor parameter properties. Use `as const` objects and union types.
- Model UI state as discriminated unions (`AsyncState<T>` in `packages/core`), never as `isLoading` / `isError` booleans.
- Every external input is `unknown` until a Zod schema accepts it: request bodies, query strings, URL params, API responses, socket messages.
- Shared types and schemas live in `packages/core`. Never duplicate them in `api` or `web`.

## Backend rules

- Structure per module: `src/modules/<name>/` → `*.routes.ts` (HTTP only) → `*.service.ts` (logic, a `create…Service(repos, config)` factory) → `*.repository.ts` (interface) with a `prisma-*.repository.ts` implementation. Every new repository also gets an in-memory version in `test/support`.
- `src/server.ts` is the only file that reads `.env` and creates Prisma. `createApp(deps)` takes everything it needs as arguments.
- Validate with `parse(schema, input)`; throw `AppError` for expected errors. Every error response has the shape `{ error: { code, message, fields? } }`.
- Check permissions on the **server** for every route. Hiding a button in the UI is not security.
- Never return `passwordHash` or token hashes. Map rows to `core` types before sending them.
- Schema changes go through `prisma migrate dev --name <change>`. Never edit a migration that has already been applied.
- One `PrismaClient` (`src/db.ts`). Use transactions for multi-row changes.

## Frontend rules (rubric: State, Network, Components)

- **Real data only:** every screen shows data from the API, which reads PostgreSQL. Never hard-code mock or demo data in the web app; the prototype's fake data is only a visual reference. (In-memory dummy data is allowed only inside automated tests.)
- Match `docs/taskflow-prototype.html` for layout, colours and wording.
- **Minimal `useEffect`**: derive values during render, put user actions in event handlers, and use `useSyncExternalStore` for browser subscriptions.
- Server data goes through TanStack Query. Mutations are **optimistic with rollback** and a clear error message.
- Filters, sorting, paging and tabs live in the **URL** (`useUrlState<T>`).
- Every screen has loading (skeleton), empty, error (with Retry) and success states.
- Components are small and composable (compound components or slots), not boolean-prop explosions.
- Accessibility: keyboard reachable, visible focus, labels on every input, ARIA roles on custom widgets.

## Testing and verification

- Every API endpoint gets Supertest tests: happy path, invalid input (400), not signed in (401), wrong role (403) and edge cases.
- Before saying a module is done: `npm run typecheck` and `npm test` are green, and the screens have been checked in a browser at **375 / 768 / 1440 px**.
- Report honestly. If a test fails or a step was skipped, say so.

## Never

- Use Docker for this project.
- Commit `.env`, secrets or the `generated/` Prisma client.
- Add a dependency without a reason. Prefer what is already installed.
- Leave `console.log` debugging in committed code.
