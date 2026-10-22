# Trace Lab: database set-up

| File | What it is |
|---|---|
| `create_database.sql` | The one statement that creates Trace Lab's own database, `hoist_tracelab`, on the same Postgres server as Hoistra. |

Run it by hand, as the README at the repository root describes ("Deploy", step 1). Then apply the migrations from
inside the running container:

```sh
docker compose exec trace-lab python -m trace_lab.migrate apply --expect-db hoist_tracelab --through 0011 --applied-by NAME
```

Nothing here runs by itself. Boot only checks the schema (`TRACE_LAB_SCHEMA=verify`).
