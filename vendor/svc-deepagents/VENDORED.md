# svc-deepagents, vendored

Taken from: Hoistra branch `eval-2`, commit `1684810` (0 uncommitted svc-deepagents files), on 2026-10-21.

Trace Lab reuses Hoistra's svc-deepagents code as a library. Nothing here is edited. The image copies `src/` and
`skills/` beside the Trace Lab service and puts both on `PYTHONPATH`. The Trace Lab code imports:

- `src.services.principal`: who is signed in. It passes the person's token to Hoistra's operations-intelligence
  (`GET /api/auth/me`).
- `src.agents.trace`: the names of Hoistra's trace tables and how a recorded run is read.
- `src.database`: the database session that Trace Lab installs on its read-only engine.
- The orchestrator itself, for golden runs (asking the chat a question again).

**Keep it in step with Hoistra.** When Hoistra changes svc-deepagents (especially sign-in, or the trace tables),
refresh this copy with `scripts/sync-from-hoistra.sh /path/to/Hoistra_Plenum`, run the tests and rebuild the image.
A Trace Lab built from an old copy can misread a run that a newer Hoistra recorded.
