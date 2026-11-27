# TaskFlow — Project Plan

Version 1 of the client's **Full-Spectrum Frontend Engineering Playbook** capstone (see `../Frontend.pdf`):
an Advanced Project Management System built with **React + TypeScript, Express, Prisma and PostgreSQL**.

- **Design reference:** `docs/taskflow-prototype.html` (approved clickable prototype). Screens, layout, colours and behaviour follow it.
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
- [ ] Screens have **loading, empty, error and success** states
- [ ] **Side-by-side check with the prototype:** open `docs/taskflow-prototype.html` (serve it with `python -m http.server` in `docs/`) and the real app at 1440 px, compare every screen the module touches, fix differences, and list anything deliberately left for a later module in the **Prototype parity** table below
- [ ] Works with the keyboard and has accessible labels
- [ ] `npm run typecheck` and `npm test` are green
- [ ] Claude has checked it in a real browser at **375 / 768 / 1440 px**
- [ ] **The user has tested and approved it**, then it is committed to Git

The next module starts only after the user approves the current one.

### Prototype parity — items the prototype shows that land in a later module

Checked side by side on 2026-11-26 (Projects, Sprints, Team & roles, Sign in). Tick these off as they are built.

| Prototype element | Where it appears | Built in |
|---|---|---|
| **+ New task** button in the top bar | Every page | ✅ Module 5 |
| Project card progress bar ("8 of 25 tasks done") | Projects | ✅ Module 5 |
| Sprint card progress, "x of y tasks done · points", task list, "+ N more · see all" | Sprints | ✅ Module 5 |
| **Backlog** card with "Move to sprint…" | Sprints | ✅ Module 5 |
| **Open tasks** column | Team & roles | ✅ Module 5 |
| **Open board** button on the active sprint | Sprints | ✅ Module 6 |
| Global search bar ("press /") and keyboard-shortcut help (`?`, `C`, `G` then a letter) | Top bar | ✅ Module 7 |
| Tasks table pager ("Showing 1–8 of 25", rows per page, ‹ 1 2 3 ›) | Tasks & issues | ✅ Module 7 (sizes 10/25/50/100 instead of 5/8/15/25, see Decisions log) |
| **History** list inside the task dialog | Task dialog | ✅ Module 8 |
| Activity history page (day groups, Person / Event type filters, Open link) | Activity history | ✅ Module 8 (also shows the project name on each line, since the timeline spans all projects) |
| Notification bell with unread count | Top bar | ✅ Module 9 |
| Dashboard (stats, burndown, workload, my tasks, recent activity) | Dashboard | ✅ Module 10 (workload bars use one colour, the avatar shows the person) |

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
| **Status** | ✅ Approved 2026-11-26 |

### Module 2 — Roles & Permissions
| | |
|---|---|
| **Features** | 4 workspace roles (Admin, Project Manager, Developer, Viewer); 11 permissions (as in the prototype); an editable permission matrix (needs `role:manage`; the Admin column is locked to "all"); a member list with role change (needs `user:manage`; you can't change your own role; the last Admin can't be demoted); **email invites** with resend and cancel; an invite-accept page; a `can()` helper in the UI; a permission check on **every** API route |
| **Sign-up rule** | The first account ever becomes **Admin**. Later public sign-ups become **Viewer** until promoted. Invited people get the role chosen in the invite. |
| **Email** | SMTP via nodemailer when `SMTP_*` is set in `.env`. Otherwise (development only) the API terminal prints the email, including the invite link. Production refuses to start without SMTP. |
| **Tables** | `roles`, `permissions`, `role_permissions`, `invites`, plus `users.role_id`. Default roles and permissions are inserted by the migration. |
| **Done when** | A Viewer cannot change anything, even by calling the API directly. Toggling a permission takes effect on the next request. An invited person can join from the link. |
| **Status** | ✅ Approved 2026-11-26 |

### Module 3 — Project Management
| | |
|---|---|
| **Features** | Create and edit projects; unique project key (2–5 capital letters, suggested from the name, live availability check, **can't be changed after creation**); description; colour (8-colour palette); members (add or remove workspace members); delete with typed-key confirmation; project switcher in the sidebar; progress per project (shows real numbers once Module 5 adds tasks) |
| **Visibility** | A project is visible to its members and to every Admin. The creator becomes a member automatically. Non-members get 404, so a project's existence isn't revealed. |
| **Permissions** | Create needs `project:create`; edit and members need `project:update`; delete needs `project:delete` |
| **URLs** | `/projects` (grid), `/projects/:key` (overview, members, settings). Later modules add `/projects/:key/board`, `/sprints` and `/tasks`. |
| **Tables** | `projects`, `project_members` (+ database CHECK constraints on key and colour format) |
| **Done when** | Projects CRUD works, a duplicate key is rejected, and a user only sees projects they are a member of (Admins see all). |
| **Status** | ✅ Approved 2026-11-26 |

### Module 4 — Sprint Management
| | |
|---|---|
| **Features** | Create a sprint (name — default "Sprint N", goal, start date, 1–4 week duration); edit (planned: everything; active: name, goal, end date; completed: read-only); start; complete; delete (planned only); **only one active sprint per project** (enforced in the database); Overview / Sprints tabs on each project; sidebar "Sprints" opens the last project's sprints |
| **Lifecycle** | planned → active → completed. Starting keeps the planned dates and records when it really started. |
| **Moved to Module 5** | The backlog view and "unfinished tasks move to the next sprint or the backlog on complete" need tasks, so they are built with tasks in Module 5. |
| **Permissions** | Viewing follows project visibility; every change needs `sprint:manage` |
| **URLs** | `/projects/:key/sprints`; `/sprints` redirects to the last project's sprints |
| **Tables** | `sprints` (+ CHECK constraints on status, dates and name; at most one active sprint per project) |
| **Done when** | The full sprint lifecycle works, and starting a second active sprint is refused. |
| **Status** | ✅ Approved 2026-11-26 |

### Module 5 — Task & Issue Management
| | |
|---|---|
| **Features** | Create, edit and delete tasks; type (Story/Task/Bug), status (To Do / In Progress / In Review / Done), priority (Critical/High/Medium/Low), story points (1, 2, 3, 5, 8, 13), assignee (project members only), sprint or backlog, due date; task keys like `TF-101` (per project, start at 101, never reused); detail dialog; **subtasks**; **comments** with **@mentions**; description autosave; reusable typed `<DataGrid<T>>`; **+ New task** in the top bar |
| **From Module 4** | **Backlog** on the Sprints page ("Move to sprint…"); **Complete sprint** asks where unfinished tasks go (next planned sprint or backlog); deleting a planned sprint moves its tasks to the backlog |
| **Prototype parity** | Progress bars on project and sprint cards, sprint task list with "+ N more · see all", **Open tasks** column on Team & roles |
| **Build order** | 5a tasks core (table, detail dialog, new task) → 5b subtasks, comments, mentions, autosave → 5c sprint integration and progress |
| **Permissions** | Create `task:create`; edit `task:update`; delete `task:delete`; comment `comment:create` (delete your own comment; Admins can delete any) |
| **URLs** | `/projects/:key/tasks` (table); `?task=TF-107` opens that task's dialog (shareable); `/tasks` opens the last project's tasks |
| **Tables** | `tasks` (+ `projects.next_task_number`), `subtasks`, `comments` |
| **Done when** | Every field is editable with optimistic save and rollback, keys never repeat, and the permissions from Module 2 apply. |
| **Status** | ✅ Approved 2026-11-26 |

### Module 6 — Kanban Board (Drag & Drop)
| | |
|---|---|
| **Features** | 4 columns, drag-and-drop with dnd-kit, a saved card order (fractional `position` so a move updates one row), **optimistic update with rollback**, **keyboard moves** (arrows + Shift+←/→), board filters, read-only board for Viewers |
| **Done when** | Moves feel instant, a failed save puts the card back with a message, and the board is fully usable without a mouse. |
| **Built** | `GET /api/projects/:key/board` (active sprint + its cards); `POST /api/projects/:key/tasks/:number/move` (`task:move`); Board tab `/projects/:key/board` and sidebar `/board`; filters + Copy link in the URL (`useUrlState<T>`); Shift+arrow keyboard moves; **Open board** on the active sprint |
| **Status** | ✅ Approved 2026-11-26 |

### Module 7 — Search, Filters & Pagination
| | |
|---|---|
| **Features** | A type-safe `useUrlState<T>` hook with **all filters, sorting and paging in the URL**; filtering, sorting and pagination done on the server; global search (tasks + projects) with debounce and request cancellation; Copy link button |
| **Done when** | Refreshing or opening a shared link shows the exact same view, and only one page of rows is ever loaded. |
| **Built** | `GET /api/projects/:key/tasks?q&status&priority&type&assignee&sprint&sort&dir&page&size` (filtered, sorted and paged in SQL; returns `{ tasks, total, page, size }`); `GET /api/search?q=` (≤7 tasks, ≤3 projects, only visible projects); `GET /api/projects/:key/planning` (all tasks, for the Sprints page); Tasks table with filters, server sort and pager in the URL; top-bar global search (combobox, ↑/↓/Enter/Esc); keyboard shortcuts + help dialog; Sprint "see all" opens the table filtered to that sprint |
| **Status** | ✅ Approved 2026-11-27 |

### Module 8 — Activity History
| | |
|---|---|
| **Features** | Every change writes an activity entry (one place, from the service layer); workspace timeline grouped by day; filters by person and event type (in the URL); task history inside the task dialog |
| **Tables** | `activity_logs` |
| **Done when** | Every action from Modules 2–6 appears in the history with who, what and when. |
| **Built** | `activity_logs` table (+ CHECK constraints); one recorder that every service reports to (29 event kinds across tasks, subtasks, comments, sprints, projects, roles, permissions, invites and sign-ups); `GET /api/activity?user&type&cursor` (30 per page, newest first, total); `GET /api/projects/:key/tasks/:number/activity`; Activity history page `/activity` (grouped by day, filters in the URL, Load more); History section in the task dialog |
| **Status** | ✅ Approved 2026-11-27 |

### Module 9 — Real-Time Notifications
| | |
|---|---|
| **Features** | Socket.IO with JWT handshake; one room per project; live board updates for other users; notifications for assignment, mention and status change; bell with unread count; mark one or all as read; reconnect handling |
| **Tables** | `notifications` |
| **Done when** | Two browsers see each other's changes live, and a mention reaches the mentioned user. |
| **Built** | `notifications` table (+ CHECK constraints on kind and payload); notification service and live updates both listen to the activity recorder; `GET /api/notifications?cursor` (20 per page, newest first, unread total), `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`; Socket.IO on the API port (access token in the handshake, user room + one room per visible project, rooms follow membership changes); top-bar bell (unread badge, dropdown, mark one / all read, optimistic with rollback, opens the task dialog); live refresh of board, table, sprints, dashboard and activity; live toasts for other people's changes in the project you're viewing; "Reconnecting…" indicator and full refetch after a reconnect. Also notifies on sprint started / completed (prototype wording). |
| **Status** | ✅ Approved 2026-11-27 |

### Module 10 — Dashboard & Analytics
| | |
|---|---|
| **Features** | Summary numbers (open, in progress, done, overdue), sprint burndown chart, tasks by status, open tasks per person, my open tasks, recent activity |
| **Done when** | All numbers come from real data and match the Tasks page. |
| **Built** | `GET /api/projects/:key/dashboard` (counts by the database); `GET /api/activity?project=&limit=`; Tasks status filter groups `?status=open` / `?status=overdue`; Dashboard at `/` (`?project=KEY`, else last project, else first): 4 summary cards linking to the matching Tasks view, sprint burndown (hover/keyboard crosshair, legend, table view), tasks by status, open tasks per person, my open tasks (open in the dialog), recent activity |
| **Status** | ✅ Approved 2026-11-27 |

### Module 11 — Finishing (quality & delivery)
| | |
|---|---|
| **Features** | Playwright end-to-end tests of the main flows; performance (profiler, virtualise long lists, bundle size); accessibility pass; security review (headers, rate limits, permission audit); dark mode; deployment; README; rubric self-review |
| **Done when** | All 5 rubric areas are at Level 3 or higher, and the app is deployed and demo-ready. |
| **Status** | ⬜ Not started |
| **Open question** | Deployment target: where will the client host it? |

### Design upgrade — screen by screen (after the prototype)
| | |
|---|---|
| **Why** | The prototype was the development baseline. Now that every feature works, each screen gets a distinctive, premium, animated look. User's request, 2026-11-27. |
| **Rules** | One screen at a time; the user reviews and approves each before the next starts. The indigo brand and the app's colour tokens stay, and so do behaviour and wording unless the user asks otherwise. Every screen still needs keyboard access, labels, reduced-motion support, light and dark, and checks at 375 / 768 / 1440 px. Illustrations use abstract shapes, never invented names or data. |
| **Library** | Motion for React (`motion/react`), loaded through `LazyMotion` with its features fetched on demand |
| **D1 — Sign in / Create account** | Live animated Kanban board illustration (cards move between columns on their own, live toasts, pointer tilt and spotlight, cards you can grab), drifting aurora background, word-by-word headline; sliding tab pill, fields with icons, show/hide password and Caps Lock warning, shake on a failed attempt, gradient submit with spinner; theme switch. Sign-in behaviour unchanged. **Round 2 (more motion, user's request):** a ~1 s opening once per tab (logo with light rings, name typing in, progress line, curtain lifts; click to skip); rising bubbles on both sides; frosted glass form card with a light beam running round its edge; shimmering title with sparkles; fields glow with a running beam and the icon pops on focus; button with moving gradient, pointer-following glow and click ripple; shooting stars, a beam round the board, a rainbow "ship together." and a sparkle burst when a card lands in Done. Fixes: the illustration's board no longer picks up the real Kanban board's grid style; an error from one tab no longer shows on the other. |
| **Next** | Chosen by the user after D1 is approved |

---

## 6. Status

| # | Module | Status |
|---|---|---|
| 0 | Project setup | ✅ Approved 2026-11-26 |
| 1 | Authentication & Users | ✅ Approved 2026-11-26 |
| 2 | Roles & Permissions | ✅ Approved 2026-11-26 |
| 3 | Projects | ✅ Approved 2026-11-26 |
| 4 | Sprints | ✅ Approved 2026-11-26 |
| 5 | Tasks & Issues | ✅ Approved 2026-11-26 |
| 6 | Kanban Board | ✅ Approved 2026-11-26 |
| 7 | Search, Filters & Pagination | ✅ Approved 2026-11-27 |
| 8 | Activity History | ✅ Approved 2026-11-27 |
| 9 | Real-Time Notifications | ✅ Approved 2026-11-27 |
| 10 | Dashboard & Analytics | ✅ Approved 2026-11-27 |
| 11 | Finishing | ⬜ Not started |
| D1 | Design upgrade: Sign in / Create account | ✅ Approved 2026-11-27 |

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
| 2026-11-26 | Invites by real email (SMTP / nodemailer); print to the console until SMTP is configured | User's choice; the email provider is decided later |
| 2026-11-26 | SMTP = Gmail (smtp.gmail.com:587, STARTTLS, App password) in `apps/api/.env`; the API verifies the login at startup | User provided a Gmail account. Credentials live only in the git-ignored `.env`. |
| 2026-11-26 | First account = Admin, later public sign-ups = Viewer | User's choice; safest default |
| 2026-11-26 | Roles are fixed (4) with text ids (`admin`, `project_manager`, `developer`, `viewer`); their permissions are editable | Matches the prototype; there's no need for custom roles in v1 |
| 2026-11-26 | Project key can't be changed after creation; it's used in URLs (`/projects/TF`) | Task IDs (`TF-101`) and shared links would break if the key changed |
| 2026-11-26 | Projects are visible to members plus all Admins; non-members get 404 | Admins must be able to reach every project; others shouldn't learn a project exists |
| 2026-11-26 | "One active sprint per project" = PostgreSQL partial unique index (`WHERE status = 'active'`), added in raw SQL | It holds even when two people press Start at once. Prisma 7.10 can't declare partial indexes but leaves this one alone (verified: no drift). |
| 2026-11-26 | Sprint dates are calendar days (`DATE`, "YYYY-MM-DD"); starting a sprint keeps its planned dates | No time-zone shifts; the real start time is recorded separately (`started_at`) |
| 2026-11-26 | Backlog and "move unfinished tasks on complete" moved to Module 5 | They need tasks, which Module 5 adds |
| 2026-11-26 | Card order = `tasks.position` (double), 1024 apart; a move sends the **neighbour card ids**, and the server puts the card at the midpoint | One row changes per move, and the browser never sends raw positions. If neighbours get closer than 0.000001, the server renumbers that one column first. A neighbour that has moved since gives 409 ("the board changed"). |
| 2026-11-26 | Moving a card needs `task:move`; changing status in the task dialog needs `task:update` | Matches the prototype's permission list; a card moved by the dialog goes to the bottom of its new column |
| 2026-11-26 | Board query key sits under the task-list key | Every task change that refreshes the Tasks table also refreshes the board, without extra wiring |
| 2026-11-26 | `useUrlState<T>` (Zod object, each field `.catch(default)`) built in Module 6 for the board filters; Module 7 reuses it for the Tasks table | The prototype keeps board filters in the URL; hand-edited or unknown values fall back to "all" |
| 2026-11-26 | Keyboard moves are custom (Shift + arrows), not dnd-kit's keyboard sensor | The prototype's shortcuts; dnd-kit handles mouse and touch only |
| 2026-11-27 | Tasks table page sizes 10 / 25 / 50 / 100, default 25 (prototype: 5 / 8 / 15 / 25, default 8) | User asked for a size that suits real projects; 8 rows is too few once a project has real data |
| 2026-11-27 | Task list filtering, sorting and paging run in SQL (`$queryRaw` with bound parameters for the page of ids, then Prisma loads those rows) | Prisma can't sort status/priority in workflow order (`array_position`) or put empty values last in both directions; sort expressions come only from a fixed whitelist |
| 2026-11-27 | Search text matches the title or the key (`TF-10` finds TF-101…109), case-insensitive; `%` and `_` are matched literally | Same rule in the table, the global search and the in-memory test repository |
| 2026-11-27 | A page past the end returns the last page (not an error); an invalid query value is a 400 | A stale shared link still shows rows; hand-made API calls get a clear error |
| 2026-11-27 | Sprints page reads `GET /api/projects/:key/planning` (all tasks) | The Tasks endpoint is now always paged; sprint planning genuinely needs every task |
| 2026-11-27 | Debounce = the query function waits 250 ms on an abortable timer; TanStack Query aborts it when the text changes | Debounce and request cancellation with no `useEffect`; only changed search text waits, paging and filters load at once |
| 2026-11-27 | Text filters kept in the URL use `<UrlTextInput>` (local text while typing, synced from the URL when it changes from outside) | React Router updates the URL asynchronously, so a box reading straight from the URL dropped characters when typing fast (also fixed on the board) |
| 2026-11-27 | Global search: picking a project opens its Board; picking a task opens `/projects/KEY/tasks?task=KEY-N` | Same as the prototype |
| 2026-11-27 | Activity = typed events (Zod discriminated union in `core`) stored as JSON, turned into sentences by the web app | Names and keys are copied in, so history still reads right after a rename or delete; the wording lives in one place (`describe.tsx`) and every event kind must be handled or it won't compile |
| 2026-11-27 | One recorder (`createActivityRecorder`) that every service calls after a change succeeds; Module 9 notifications will listen to the same events | "Every change writes an activity entry from one place". A failed history write is logged and doesn't fail the request, because the change itself is already saved |
| 2026-11-27 | Visibility: project, sprint, task and comment events follow project visibility (members + Admins); user events (roles, permissions, invites) only for `user:manage` / `role:manage`; a deleted project's events only for Admins | User's choice (recommended); invites contain email addresses |
| 2026-11-27 | Autosaved description edits by the same person within 10 minutes = one entry; reordering cards inside a board column isn't recorded | Keeps the history readable |
| 2026-11-27 | Each entry gets a strictly later time than the previous one (≤ 1 ms later) and the timeline pages by (created_at, id) | Several fields saved at once keep their order; "Load more" never skips or repeats an entry |
| 2026-11-27 | History starts at Module 8; earlier changes can't be rebuilt | User agreed |
| 2026-11-27 | Module 10 (Dashboard) is built before Module 9 (Real-time notifications) | User's choice; the dashboard needs nothing from Module 9 |
| 2026-11-27 | Dashboard lives at `/` and shows one project: `?project=KEY`, else the last project opened, else the first; the sidebar switcher stays on the dashboard | User's choice (recommended); same "current project" rule as the other sections, and the URL is shareable |
| 2026-11-27 | Dashboard numbers are counted with the same filters as the Tasks table; new status groups `open` (not done) and `overdue` (not done, due before today) let each card link to exactly the tasks it counts | "Numbers match the Tasks page" is checked by tests on both the in-memory and the real database |
| 2026-11-27 | "Today" for overdue = the server's calendar date; the burndown uses the viewer's calendar (done times are turned into local days in the browser) | Counts must agree between the card and the table (both server-side); the chart is personal and should match the viewer's day |
| 2026-11-27 | Burndown = sprint total − work Done on or before each day (from `tasks.done_at`), counting tasks when nothing has points | User's choice (recommended): simple and testable. Limitation: uses the sprint as it is now (tasks added mid-sprint count from day 1; a reopened task loses its done day) |
| 2026-11-27 | Charts follow the dataviz checklist: palette validated (light + dark), 2px lines, legend, crosshair tooltip on hover and ←/→ keys, table view, previous render dimmed while refreshing | Accessible and readable; no value is only reachable by hovering |
| 2026-11-27 | Notifications and live updates are listeners on the Module 8 activity recorder (`subscribe`), not extra calls in each service | One place decides what happened; a failed listener is logged and never fails the request |
| 2026-11-27 | Who is notified: assigned → the new assignee; @mention → each mentioned member; status change (dialog or board) → assignee + reporter; sprint started / completed → every project member. Never the person who made the change, and only current project members | Matches the prototype's notifications; non-members must not learn about a project |
| 2026-11-27 | A notification gets the same time as its history entry (the recorder's strictly increasing clock) | Two changes in the same millisecond keep their order in the bell |
| 2026-11-27 | Socket.IO runs on the API's port, proxied by Vite at `/socket.io` (same origin); the handshake sends the in-memory access token; a refused handshake refreshes the token once and reconnects | No CORS or cookie changes; the refresh token never reaches page scripts |
| 2026-11-27 | Live messages say *what* changed; screens refetch through TanStack Query (no data is pushed into the cache except new notifications). After a reconnect everything is refetched | Permissions stay on the normal API routes, and nothing missed while offline stays stale |
| 2026-11-27 | Live toasts only for other people's changes in the project you're viewing, at most one per person and task every 5 s | Autosave and bursts of edits don't flood the screen |
| 2026-11-27 | On phones (≤ 420 px) the "Reconnecting…" pill shrinks to its pulsing dot (text kept for screen readers and as a tooltip) | The full pill didn't fit the 375 px top bar |
| 2026-11-27 | Design upgrade track (D1, D2, …): screens are restyled one at a time after the prototype phase, starting with Sign in; the indigo brand and colour tokens stay | User's choice: the prototype was the development baseline, and the product should now look distinctive |
| 2026-11-27 | Motion for React 14 for UI animation, through `LazyMotion` (features load on demand) and `MotionConfig reducedMotion="user"`; the sign-in illustration is a separate chunk | The user asked for Motion; this keeps first paint light and respects reduced-motion settings |
| 2026-11-27 | "Magic UI"-style effects (border beam, sparkles, meteors, bubbles, shimmer text, ripple) are rebuilt with Motion + plain CSS, not the Magic UI library | Magic UI needs Tailwind, which this app doesn't use; no new dependency |
| 2026-11-27 | The sign-in opening plays once per browser tab (sessionStorage), never with reduced motion, and can be skipped with a click | Delights on first visit without slowing down people who sign in often |
| 2026-11-27 | The sign-in illustration uses abstract cards (type badge, grey lines, coloured avatar dots), no task names or people | "Real data only": an illustration must not look like made-up data |
