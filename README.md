# TaskFlow

Project management app (projects, sprints, tasks, Kanban board, real-time updates).
React + TypeScript, Express, Prisma 7 and PostgreSQL. The plan and status of each module are in [PLAN.md](PLAN.md).

## Requirements

- Node.js 22 or newer (developed on Node 24)
- PostgreSQL running locally (this machine: PostgreSQL 19 on port 5433, managed with pgAdmin 4)

## First-time setup

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then set DATABASE_URL and JWT_ACCESS_SECRET
npm run db:migrate                       # creates the database and tables
```

## Run

```bash
npm run dev
```

- Web app: http://localhost:5200
- API: http://localhost:4100 (health check: `/api/health`)

## Checks

```bash
npm run typecheck   # strict TypeScript in every package
npm test            # API + shared tests (in-memory dummy data, no database needed)
```

## Structure

| Folder | What it is |
|---|---|
| `packages/core` | Shared TypeScript types and Zod schemas (used by both API and web) |
| `apps/api` | Express API. `src/modules/<module>` has routes → service → repository |
| `apps/web` | React app. `src/features/<module>` has the screens for each module |
