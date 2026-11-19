# Task Manager

Web todo list with an MCP server so that AIs (a local AI, then Claude) can create, update and delete tasks.

## Architecture

```
Browser (PC / mobile) ─> Vercel (React) ── rewrite /api/* ─┐
Local AI ─┐                                                ▼
Claude ───┴─> MCP (Py) ──────────> Oracle VPS: Caddy (HTTPS, <IP>.sslip.io)
                                         └─> Express API ──> MongoDB
```

- **Frontend**: deployed on **Vercel** (root directory `frontend/`). `frontend/vercel.ts` rewrites
  `/api/*` to `https://<IP>.sslip.io/api/*`, so the front always calls `/api` (no CORS).
- **Oracle VPS**: `infra/` runs Caddy alone (shared by every project on the VPS, external Docker
  network `proxy`); `docker-compose.yml` runs `mongo`, `api` and `mcp`. Only Caddy publishes
  ports (80/443); it obtains the Let's Encrypt certificate for `<IP>.sslip.io` automatically.
- The website and the MCP server **both go through the Express API**; only the API talks to MongoDB.

## Repo structure (target)

```
task_manager/
├── frontend/           # React + TypeScript (Vite)
├── backend/            # Express + Mongoose
├── mcp-server/         # Python MCP server (uv) — not created yet
├── infra/              # Shared Caddy: docker-compose, Caddyfile (/api, /mcp, /mcp-linkedin), Makefile
├── docker-compose.yml  # VPS stack: mongo + api + mcp (proxy network)
├── Makefile            # make up / down / restart / logs / ps
└── .env.example        # MONGODB_URI, API_TOKEN, API_URL (API_DOMAIN and MCP_TOKEN: infra/.env)
```

## Data model

```ts
Category { id: string, name: string, order: number }   // `categories` collection
Task { id: string, title: string, category: string /* ObjectId of a Category */, done: boolean,
       parent: string | null /* ObjectId of the parent Task, null = root */,
       position: number /* index among its siblings */ }
```

- Task order: `position` is the index among the siblings (same `parent`, plus same `category` for a root;
  done roots count too). `GET /api/tasks` sorts by `position` then `createdAt`. `POST` prepends (first − 1, can be negative);
  `PATCH { position }` inserts the task at that index and renumbers the siblings 0..n-1 (`placeTask()`); a task
  that changes list (parent or category) without `position` goes last. Deletions leave holes (harmless).

- Subtasks (any depth): `parent` references another task. A subtask takes its parent's category
  (`POST` ignores `category` with `parent`; `PATCH category` on a subtask is refused unless it also
  sends `parent: null`, which detaches it). `PATCH { parent: <taskId> }` moves a task (with its subtree) under
  another one: it takes that task's category (a sent `category` is ignored) and `done: true` if it is done;
  a parent that is the task itself or in its subtree is a 400. Changing a task's category moves its whole subtree;
  `done: true` checks it too (`done: false` only unchecks the task itself).
  `DELETE /api/tasks/:id`, `?done=true` and `/api/categories/:id/tasks` delete whole subtrees
  (`subtreeIds()`, `$graphLookup`); the last two only target root tasks, so a checked subtask
  stays under its not-done parent. `setupTasks()` sets `parent: null` on legacy tasks at startup.
- Front: columns list root tasks; `Board.renderTask` renders subtasks recursively inside their
  parent's `<li>`. The `+` in a task's actions opens `AddTaskForm` under it. Dropping a subtask on
  another column detaches it (`PATCH { parent: null, ... }`); dropping a task on another task nests it
  (`useBoard.nestTask`, `PATCH { parent }`). Each list (not in `Done`) has a `TaskGap` before each task and at
  its end: dropping there reorders (`useBoard.reorderTask`, one `PATCH { position, parent?, category? }`, optimistic).
  `Board`'s collision detection tries gaps under the pointer first, then tasks (`pointerWithin`, excluding the
  dragged subtree), then columns.

- On startup, `setupCategories()` (`backend/src/models/category.ts`) creates the `Other` category (renaming a legacy `Autres` one)
  if it doesn't exist, renumbers the other categories' `order` 0..n-1, and migrates tasks whose
  `category` is still a name to the ObjectId.
- `order` is the index among the categories other than `Other` (0..n-1, no gaps; `Other`'s own
  `order` is ignored). `POST` appends at n, `DELETE` closes the gap, `PATCH /api/categories/:id`
  (`{ name?, order? }`) moves to index `order` and shifts the categories in between. `Other` can't
  be renamed or moved.
- No foreign keys in MongoDB: the API checks that the category exists (`POST`/`PATCH`).
  Without a category, a task goes into `Other`. `GET /api/categories` lists the sorted categories.
- `Other` and the `Done` column (front) exist without the user: not deletable, always last
  (`Other` then `Done`), fixed color. Other categories: `POST`/`DELETE /api/categories`.
- Front: no global add-task form. Each category column (not `Done`) has a `+` button in its
  header that opens an inline field (`AddTaskForm`); the category is the column's. The field stays
  open after Enter, and closes with Escape or on blur if empty.
  The top form (`AddForms`) only creates categories.
- Column drag and drop (`@dnd-kit/core`, same `DndContext` as tasks): the header is the handle
  (not `Other`/`Done`); drop zones are `ColumnSlot`s in the gap before each column. A dragged column
  only targets slots (`closestCenter`), a dragged task only columns (`rectIntersection`).
  `useBoard.moveCategory` sends one `PATCH { order }` (optimistic, rolled back on failure).

## Plan (in order)

1. **Backend** — Express + Mongoose in TypeScript (run directly by Node, no build).
   Done: `GET/POST /api/tasks`, `PATCH /api/tasks/:id` (body `{ done: boolean }`).
   Remaining: `DELETE /api/tasks/:id`. The frontend calls the API via axios (`baseURL: '/api'`,
   Vite proxy in dev).
2. **MCP server (Python)** — tools `list_tasks`, `create_task`, `update_task`, `delete_task`,
   which call the Express API. Streamable HTTP transport.
3. **Deployment** — front on Vercel (done). Oracle VPS: `docker-compose` + Caddy + sslip.io
   (files ready). Open 80/443 in the Oracle Security List **and** the VM's iptables, then
   `make up` in `infra/` (with `infra/.env`: `API_DOMAIN`, `MCP_TOKEN`) then `make up` at the root.
   Set the Vercel project variable `API_DOMAIN=https://<IP>.sslip.io` (read by `frontend/vercel.ts` at build). If sslip.io causes problems: Let's Encrypt
   certificate on the IP (Caddy, `profile shortlived`).
4. **AI connection** — first the local AI (Bearer token), then Claude Code
   (`claude mcp add --transport http`), then claude.ai / Desktop / Mobile via a
   custom connector (requires OAuth).

## Conventions

- Frontend: the UI never touches storage directly, only through the async `TaskStorage`
  interface (`frontend/src/services/taskStorage.ts`).
- Python: no private functions or attributes (no `_` prefix).
- Never commit a `.env`; provide a `.env.example`.
- Two `.env` files: `backend/.env` for local dev (`MONGODB_URI` on `localhost`), `.env` at the
  root for docker compose (`MONGODB_URI` on host `mongo`). The Docker image ships no `.env`.
- Mongoose: use `{ returnDocument: 'after' }` (the `new` option is deprecated).
- Auth: every `/api` request requires `Authorization: Bearer $API_TOKEN` (middleware
  `backend/src/middleware/auth.ts`). Vercel adds it via a request header in `vercel.ts` (Vercel
  project variable `API_TOKEN`); in dev, the Vite proxy reads it from `backend/.env`.
- Shell: `ls` is aliased to `eza`, which can hang in non-interactive mode; use `/bin/ls`.

## Commands

- Frontend (in `frontend/`): `npm run dev`, `npm run build`, `npm run lint`
- Backend (in `backend/`): `npm run dev`, `npm start`, `npm run typecheck`
- Docker stack (at the root): `make up`, `make down`, `make logs`, `make ps`
- Caddy (in `infra/`): `make up`, `make reload` (reloads the Caddyfile), `make logs`
- API tests: `scripts/test-api.sh` runs every collection in `postman/collections/` against the local API
  (`BASE_URL`, `MCP_URL`, `API_TOKEN` overridable; token read from `backend/.env` by default)
- Git hooks: `git config core.hooksPath .githooks` (once per clone); `.githooks/pre-push` runs
  `scripts/test-api.sh` if `backend/`, `postman/` or `mcp/` changed, `npm --prefix frontend test` if `frontend/` changed

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
