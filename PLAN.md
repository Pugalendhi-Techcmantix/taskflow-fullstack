# TaskFlow — Project Plan

Version 1 of the client's **Full-Spectrum Frontend Engineering Playbook** capstone (see `../Frontend.pdf`):
an Advanced Project Management System built with **React + TypeScript, Express, Prisma and PostgreSQL**.

- **Design reference:** `../taskflow-prototype.html` (approved clickable prototype). Screens, layout, colours and behaviour follow it.
- **Quality bar:** the PDF's PR rubric (Part 6). Every module must reach **Level 3 ("Senior Target")** or higher.
- **Working mode:** Claude Code builds, the user tests and approves. One module at a time.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 7, `strict` | `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (no `enum`, `namespace`, or parameter properties) |
| Frontend | React 19 + Vite | React Router, TanStack Query, dnd-kit (Module 6), Socket.IO client (Module 9) |
| Backend | Node.js 24 + Express 5 | helmet, cors, express-rate-limit, cookie-parser |
| Database | **Local PostgreSQL 19**, managed with **pgAdmin 4** | No Docker |
| ORM | **Prisma 7.10.1** (latest stable) | Prisma 8 is still a release candidate. Do not upgrade until it is stable. |
| Validation | Zod 4 | Schemas live in `packages/core` and are shared by the API and the web app |
| Auth | JWT access token (15 min, kept in memory) + rotating refresh token (httpOnly cookie) | Passwords hashed with bcryptjs |
| Real-time | Socket.IO | Module 9 |
| Tests | Vitest + Supertest (API), Playwright (browser) | API tests use **in-memory dummy data** (no test database) |
| Packages | npm workspaces | No pnpm or yarn |

## 2. Local setup (no Docker)

- Local **PostgreSQL 19** (Windows service `postgresql-x64-19`) listens on port **5433** on this machine.
- One database only: **`taskflow`**. Prisma created it with the first migration. You can browse it in pgAdmin.
- Connection: `apps/api/.env` (git-ignored), using the `postgres` user. The password is typed by the user, never by Claude:

```
DATABASE_URL="postgresql://postgres:<password>@localhost:5433/taskflow?schema=public"
```

- Automated tests **do not use a database**. They run the real API against in-memory dummy data (`apps/api/test/support`).
- Ports 4000 and 5173 are used by another local project (`dev_dash`, Docker), so TaskFlow uses **4100** (API) and **5200** (web).

**Daily commands** (from `taskflow/`):

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API (http://localhost:4100) and the web app (**http://localhost:5200**) together |
| `npm run db:studio` | Opens Prisma Studio to view and edit data |
| `npm run db:migrate` | Applies schema changes to the dev database |
| `npm test` | Runs all automated tests |
| `npm run typecheck` | Strict TypeScript check of every package |

## 3. Repository layout

```
taskflow/
  PLAN.md            ← this file: what we build and the status of each module
  CLAUDE.md          ← rules Claude Code follows in this repo
  packages/core/     ← shared TS types + Zod schemas (used by api and web)
  apps/api/          ← Express + Prisma
    prisma/          ← schema.prisma + migrations
    src/modules/<module>/  ← routes → service → repository interface (+ Prisma implementation)
    src/server.ts    ← the only file that wires in Prisma and .env
    test/            ← Supertest API tests; test/support = in-memory repositories (dummy data)
  apps/web/          ← React + Vite
    src/app/         ← shell, navigation, shared pages
    src/features/<module>/ ← screens and hooks per module
    src/lib/http.ts  ← the one fetch wrapper (token, silent refresh, Zod-checked responses)
```

## 4. Definition of done (every module)

A module is **done** only when all of these are true:

- [ ] Database tables migrated (Prisma migration committed)
- [ ] API endpoints validated with Zod, with permissions enforced on the server
- [ ] API tests pass, covering the happy path, invalid input, unauthorised access and edge cases
- [ ] Screens match the prototype and have **loading, empty, error and success** states
- [ ] Works with the keyboard and has accessible labels
- [ ] `npm run typecheck` and `npm test` are green
- [ ] Claude has checked it in a real browser at **375 / 768 / 1440 px**
- [ ] **The user has tested and approved it**, then it is committed to Git

The next module starts only after the user approves the current one.

---

## 5. Modules

Order follows dependencies: each module builds on the ones before it.

### Module 0 — Project setup
| | |
|---|---|
| **Features** | npm workspaces monorepo, strict TS config, shared `core` package, Express app skeleton (helmet, CORS, JSON errors, health check), Vite + React app shell, local Postgres connection, test setup, README |
| **Done when** | `npm run dev` starts both apps; `/api/health` reports the database is up; typecheck and tests are green |
| **Status** | ✅ Approved 2026-11-26. |

### Module 1 — Authentication & User Management
| | |
|---|---|
| **Features** | Register, sign in, sign out, stay signed in after a refresh (silent refresh), protected routes, return to the requested page after login, refresh-token rotation with theft detection, rate limiting on login and register, same error for a wrong email or a wrong password |
| **Tables** | `users`, `refresh_tokens` |
| **API** | `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/auth/me` |
| **Screens** | Sign in / Create account (prototype auth page), app shell with sidebar, topbar and user menu |
| **Done when** | A user can register, log in, refresh the page and stay logged in, and log out. A stolen refresh token cannot be reused. |

### Module 2 — Roles & Permissions
| | |
|---|---|
| **Features** | 4 roles (Admin, Project Manager, Developer, Viewer); 11 permissions (as in the prototype); an editable permission matrix (Admin only); a member list with role change; invite member; a `can()` helper in the UI; a permission check on **every** API route |
| **Tables** | `roles`, `permissions`, `role_permissions`, plus a `role_id` column on `users`; seed script |
| **Done when** | A Viewer cannot change anything, even by calling the API directly. Toggling a permission takes effect at once. |
| **Open question** | Invites: real email, or a copyable invite link for v1? (Recommended: invite link.) |

### Module 3 — Project Management
| | |
|---|---|
| **Features** | Create and edit projects, unique project key (2–5 capital letters, async check), description, colour, members, project switcher, progress per project |
| **Tables** | `projects`, `project_members` |
| **Done when** | Projects CRUD works, a duplicate key is rejected, and a user only sees projects they are a member of. |

### Module 4 — Sprint Management
| | |
|---|---|
| **Features** | Create a sprint (name, goal, start date, duration), start, complete (unfinished tasks move to the next sprint or the backlog), backlog view, **only one active sprint per project** (enforced in the database) |
| **Tables** | `sprints` |
| **Done when** | The full sprint lifecycle works, and starting a second active sprint is refused. |

### Module 5 — Task & Issue Management
| | |
|---|---|
| **Features** | Create, edit and delete tasks; type (Story/Task/Bug), status, priority, story points, assignee, sprint, due date; task keys like `TF-101`; detail dialog; **subtasks**; **comments** with **@mentions**; description autosave; reusable typed `<DataGrid<T>>` |
| **Tables** | `tasks`, `subtasks`, `comments`, plus a per-project key sequence |
| **Done when** | Every field is editable with optimistic save and rollback, keys never repeat, and the permissions from Module 2 apply. |

### Module 6 — Kanban Board (Drag & Drop)
| | |
|---|---|
| **Features** | 4 columns, drag-and-drop with dnd-kit, a saved card order (fractional `position` so a move updates one row), **optimistic update with rollback**, **keyboard moves** (arrows + Shift+←/→), board filters, read-only board for Viewers |
| **Done when** | Moves feel instant, a failed save puts the card back with a message, and the board is fully usable without a mouse. |

### Module 7 — Search, Filters & Pagination
| | |
|---|---|
| **Features** | A type-safe `useUrlState<T>` hook with **all filters, sorting and paging in the URL**; filtering, sorting and pagination done on the server; global search (tasks + projects) with debounce and request cancellation; Copy link button |
| **Done when** | Refreshing or opening a shared link shows the exact same view, and only one page of rows is ever loaded. |

### Module 8 — Activity History
| | |
|---|---|
| **Features** | Every change writes an activity entry (one place, from the service layer); workspace timeline grouped by day; filters by person and event type (in the URL); task history inside the task dialog |
| **Tables** | `activity_logs` |
| **Done when** | Every action from Modules 2–6 appears in the history with who, what and when. |

### Module 9 — Real-Time Notifications
| | |
|---|---|
| **Features** | Socket.IO with JWT handshake; one room per project; live board updates for other users; notifications for assignment, mention and status change; bell with unread count; mark one or all as read; reconnect handling |
| **Tables** | `notifications` |
| **Done when** | Two browsers see each other's changes live, and a mention reaches the mentioned user. |

### Module 10 — Dashboard & Analytics
| | |
|---|---|
| **Features** | Summary numbers (open, in progress, done, overdue), sprint burndown chart, tasks by status, open tasks per person, my open tasks, recent activity |
| **Done when** | All numbers come from real data and match the Tasks page. |

### Module 11 — Finishing (quality & delivery)
| | |
|---|---|
| **Features** | Playwright end-to-end tests of the main flows; performance (profiler, virtualise long lists, bundle size); accessibility pass; security review (headers, rate limits, permission audit); dark mode; deployment; README; rubric self-review |
| **Done when** | All 5 rubric areas are at Level 3 or higher, and the app is deployed and demo-ready. |
| **Open question** | Deployment target: where will the client host it? |

---

## 6. Status

| # | Module | Status |
|---|---|---|
| 0 | Project setup | ✅ Approved 2026-11-26 |
| 1 | Authentication & Users | ✅ Approved 2026-11-26 |
| 2 | Roles & Permissions | ⏳ Planning |
| 3 | Projects | ⬜ Not started |
| 4 | Sprints | ⬜ Not started |
| 5 | Tasks & Issues | ⬜ Not started |
| 6 | Kanban Board | ⬜ Not started |
| 7 | Search, Filters & Pagination | ⬜ Not started |
| 8 | Activity History | ⬜ Not started |
| 9 | Real-Time Notifications | ⬜ Not started |
| 10 | Dashboard & Analytics | ⬜ Not started |
| 11 | Finishing | ⬜ Not started |

Legend: ⬜ not started · ⏳ in progress · 🧪 waiting for user test · ✅ approved and committed

## 7. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-25 | Prisma 7.10.1, not Prisma 8 | Prisma 8 is still a release candidate; a client project needs a stable version |
| 2026-11-25 | Local PostgreSQL 19 + pgAdmin, no Docker | User's choice; Postgres 19 is already installed and running |
| 2026-11-25 | npm workspaces, shared `core` package | One set of types and Zod schemas for both the API and the UI |
| 2026-11-25 | Access token in memory + refresh token in an httpOnly cookie, rotated on every use | Page scripts cannot read the refresh token, and a replayed (stolen) token ends the whole session |
| 2026-11-25 | bcryptjs for passwords | Pure JavaScript, so there are no native build problems on Windows |
| 2026-11-26 | No test database: services talk to storage through repository interfaces; tests plug in in-memory fakes | User's choice. Tests are fast and never touch real data. |
| 2026-11-26 | Ports 4100 (API) and 5200 (web); Postgres on 5433 | 4000 and 5173 are taken by another local project; the Postgres installer chose 5433 |
| 2026-11-26 | `node --watch --import tsx` instead of `tsx watch` | `tsx watch` hung on startup on this Windows machine |
| 2026-11-26 | The "two tabs refresh at once" grace window only applies while the login still has a live token | Tests caught that the grace window briefly re-opened logged-out or stolen sessions |
