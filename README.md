# Hoist Trace Lab

Trace Lab is where chosen people (domain experts, testers, admins and users) label how Hoistra answered each question.
For every question asked in Hoistra, it shows each step the answer was built from: the agent, each model call, each
database read and the final answer. People select any text in a step, or a whole step, and label it Right, Wrong or
Not sure with a note. All labels are collected on one page, with who gave each one, and can be downloaded as a CSV.

This repository holds Trace Lab only: the service, the page (`/lab/`), one Docker image and a compose file. It runs
**on Hoistra's database**: it reads the same questions and answers Hoistra stores, and people sign in with their
Hoistra accounts.

## What is in here

| Path | What it is |
|---|---|
| `backend/` | The Trace Lab service (FastAPI, Python 3.12): `trace_lab/`, its `migrations/`, `tests/`, `ops/create_database.sql` |
| `vendor/svc-deepagents/` | Hoistra's svc-deepagents code, used as a library (sign-in check, how runs are read). See `VENDORED.md` |
| `frontend/` | The `/lab/` page (React, built with Vite) |
| `nginx/`, `docker/entrypoint.sh` | The container's front door: the page, the service and Hoistra's sign-in on one address |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | The image and how to run it |
| `scripts/sync-from-hoistra.sh` | Refreshes this copy from a Hoistra checkout |

## How it fits with Hoistra

```
browser ──► /lab/                         the page (this container)
        ──► /backend/trace-lab/...        the Trace Lab service (this container)
        ──► /backend/ops-intelligence/... Hoistra's sign-in (Hoistra)

Trace Lab service ──► Hoistra's database, read-only (DB_URL): the questions, answers and how each was made
                  ──► Trace Lab's own records (TRACE_LAB_DB_URL): labels, who has access
                  ──► Hoistra's operations-intelligence (TRACE_LAB_UPSTREAM_OI): who is signed in
```

The page's requests are all relative, so `/lab/`, `/backend/trace-lab/` and `/backend/ops-intelligence/` must share
one address. There are two ways to do that ("Where it runs" below).

## The database

- **`DB_URL`: Hoistra's database, the same one Hoistra uses.** Trace Lab only reads it. Its connection is opened
  read-only, and it never writes there.
- **`TRACE_LAB_DB_URL`: where Trace Lab keeps its own records.** Its migrations create one schema, `tracelab`, and its
  tables there. Two choices:
  - **A. Recommended: a database `hoist_tracelab` on the same Postgres server as Hoistra.** `backend/ops/create_database.sql`
    creates it. Same server, same backups, and Hoistra cannot see it.
  - **B. Inside Hoistra's own database** (`TRACE_LAB_DB_URL` = the same database as `DB_URL`). It works, but Hoistra's
    chat can run its own SELECT queries, and nothing stops a query from naming a `tracelab.` table. Every company's
    labels and the reviewers' emails could then appear in a chat answer. Only choose B if Trace Lab connects as its
    own Postgres role that owns schema `tracelab`, and Hoistra's role is given no access to that schema.

## Deploy

### 1. Create Trace Lab's database (choice A)

```sh
PGSSLMODE=require psql "postgresql://ADMIN:PASSWORD@HOST:5432/postgres" -f backend/ops/create_database.sql
```

psql wants `postgresql://` (not `+asyncpg`) and no query string. The role that runs it owns the database. Trace Lab's
role needs CREATE on it and nothing else. The file's comments cover handing ownership over and UTF8.

### 2. Fill in `.env`

Copy `.env.example` to `.env` (or set the same variables in the platform). The ones that matter:

| Variable | Value |
|---|---|
| `DB_URL` | Hoistra's database, `postgresql+asyncpg://...?sslmode=require` |
| `TRACE_LAB_DB_URL` | `hoist_tracelab` on the same server (choice A) |
| `TRACE_LAB_UPSTREAM_OI` | Hoistra's operations-intelligence, as this container reaches it. **Required**: sign-in is checked there |
| `HOISTRA_URL` | Hoistra's public address, only when Trace Lab has its own address |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Same as Hoistra's svc-deepagents. Labelling needs neither |

The compose file sets the fixed ones (`TRACE_LAB_SCHEMA=verify`, `TRACE_LAB_ENABLED=1`, the loopback proxy addresses).
On a platform without compose, set those too. They are listed in `docker-compose.yml`.

### 3. Build, start, then apply the migrations

```sh
docker compose up -d --build
docker compose exec trace-lab python -m trace_lab.migrate status
docker compose exec trace-lab python -m trace_lab.migrate apply --expect-db hoist_tracelab --through 0009 --applied-by bala
```

- Boot never changes the database. Until the migrations are applied, the service starts and reports itself
  unavailable (`status=absent`).
- `apply` needs a terminal. It prints every statement, then asks you to type the database name before it runs
  anything.
- `--expect-db` must be the database `TRACE_LAB_DB_URL` points at. Under choice B, that is Hoistra's database name.
- The migrations only create schema `tracelab` and its tables. Applying them again is refused once the schema is up to
  date.

### 4. Check it

```sh
docker compose logs trace-lab | grep -E "schema|startup"      # trace_lab.startup.done ... status=ready version=9
curl -s http://localhost:8080/backend/trace-lab/health        # {"ok":true,"service":"trace-lab"}
```

Open `http://localhost:8080/lab/` and sign in with a Hoistra account.

## Where it runs

**Option 1: behind Hoistra's address.** Hoistra's gateway sends two paths to this container's port 8080, unchanged:

```nginx
location /lab/              { proxy_pass http://trace-lab:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
location /backend/trace-lab/ { proxy_pass http://trace-lab:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_read_timeout 300s; }
```

Leave `HOISTRA_URL` empty: Hoistra's gateway already serves `/backend/ops-intelligence/`.

**Option 2: its own address** (for example `https://tracelab.example.com`). Set `HOISTRA_URL=https://<hoistra address>`.
This container then passes `/backend/ops-intelligence/` to Hoistra, so sign-in works on Trace Lab's address. Set
`TRACE_LAB_UPSTREAM_OI=https://<hoistra address>/backend/ops-intelligence` unless the service can reach
operations-intelligence directly. Hoistra's gateway still needs the `/backend/trace-lab/` route from option 1,
because of the "Trace Lab access" switch described next.

## Who can sign in

- **Company admins** always have access. **Superadmins** (the platform team) pick a company first.
- **Everyone else** gets in only when a company admin turns Trace Lab on for them. In Hoistra, under **Users &
  access**, open the person's row and set **Trace Lab access** to domain expert, tester, admin or user. Setting it to
  "No access" turns it off. Every change is kept, with who made it.

That switch is part of **Hoistra's** frontend, not this repository: `src/lab/TraceLabAccess.jsx` (also copied here,
under `frontend/src/lab/`), mounted by two small edits in Hoistra's `src/screens/Users.jsx` and `src/logic/users.js`.
It calls `/backend/trace-lab/api/trace-lab/lab/members/...` on Hoistra's own address. So Hoistra must be deployed with
those edits, and its gateway must route `/backend/trace-lab/` to this container.

Hoistra's branch `eval-2` also carries Trace Lab inside its own all-in-one image. Run Trace Lab from one place only:
when this container is live, do not also start the Trace Lab inside Hoistra's image.

## Tests

```sh
# the page
cd frontend && npm ci && npm test && npm run build

# the service, inside the image (DB_URL only has to be present; nothing connects to it)
docker build -t hoist-trace-lab:latest .
docker run --rm -v "$PWD:/repo:ro" -v "$PWD/backend/tests:/app/svc-trace-lab/tests:ro" \
  -e TRACE_LAB_REPO=/repo -e DB_URL=postgresql+asyncpg://t:t@127.0.0.1:9/t hoist-trace-lab:latest \
  sh -c "pip install -q pytest pytest-asyncio && python -m pytest -q -p no:cacheprovider tests"
```

The database tests (`*_sql.py`) skip unless `TRACE_LAB_TEST_DB_URL` names a throwaway Postgres, never a real one. The
tests only accept a database called `tracelab_scratch` on localhost. Run them inside the scratch database's
network, so localhost is that database:

```sh
docker run -d --rm --name tl-scratch-pg -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=tracelab_scratch postgres:16-alpine
docker run --rm --network container:tl-scratch-pg -v "$PWD:/repo:ro" -v "$PWD/backend/tests:/app/svc-trace-lab/tests:ro" \
  -e TRACE_LAB_REPO=/repo -e DB_URL=postgresql+asyncpg://t:t@127.0.0.1:9/t \
  -e TRACE_LAB_TEST_DB_URL=postgresql+asyncpg://postgres:scratch@localhost:5432/tracelab_scratch hoist-trace-lab:latest \
  sh -c "pip install -q pytest pytest-asyncio && python -m pytest -q -p no:cacheprovider tests"
docker stop tl-scratch-pg
```

## Keeping it in step with Hoistra

Trace Lab reads runs exactly as Hoistra records them. When Hoistra changes svc-deepagents (sign-in, or the trace
tables), refresh with `scripts/sync-from-hoistra.sh /path/to/Hoistra_Plenum`, run the tests and rebuild.
`vendor/svc-deepagents/VENDORED.md` records which Hoistra commit this copy came from.
