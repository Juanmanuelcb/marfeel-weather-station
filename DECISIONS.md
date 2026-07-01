# Decisions

This document explains what I changed in the spike and why. The work is graded on
the decisions, so I try to be honest about the trade-offs and about the things I
chose not to build.

## The problem

The spike is a weather pipeline. Devices post readings, an ingestor computes some
metrics and stores them in ClickHouse, and a small console shows the fleet. It works
for three slow devices and falls apart under real load. The environment is set up to
punish that:

- The ingestor pod has 1 CPU and 512 MB.
- A "deployer" restarts the ingestor every 30 seconds.
- The gateway (nginx) cuts any request that takes more than 1 second.
- Devices do not retry, so a dropped request is lost for good.
- The ClickHouse schema is frozen. I cannot change the table, the sort key, or add views.

Every server decision has to survive those five things at once.

## How to run it

`docker compose up` starts everything. Open http://localhost:5173 for the console.
Raise the load with `DEVICE_COUNT=50 docker compose up`.

One setup step. I removed the committed `.env` because it had the database
credentials in git. Copy the example first and set any values (they are only used
locally):

```
cp .env.example .env
```

I did not touch the original README, since that is your evaluation guide, so I put
this note here instead.

## The one number that shaped the server

Each reading gets an integrity signature: 50,000 rounds of SHA-256. That is
expensive. I measured it at about 47 signatures per second on one core. At
`DEVICE_COUNT=50` the fleet offers about 100 readings per second. So one pod can
durably keep up with a bit under half the load, and no amount of threading changes
that. It is a CPU limit, not a code problem.

This one fact drives the whole ingestion design: keep the signature, make the loss
honest and visible, and add throughput with replicas.

## Ingestion: accept, queue, acknowledge

The spike did everything inline: hash, single-row insert, then respond. On 1 CPU
behind a 1 second timeout that returns 504s and loses data. I split it in two:

- The accept path validates the payload, pushes it to a small in-memory queue, and
  returns 202. No hashing and no database on this path.
- A background pipeline signs the reading in a worker thread, builds one row, batches
  the rows, and writes to ClickHouse through one long-lived client.

The decisions inside that:

- **Worker thread for the signature.** It keeps the accept loop free so requests
  answer under 1 second. It does not add throughput (one core is one core); replicas
  do. I kept the round count exactly as given.
- **Batched writes** (up to 500 rows, or every 1 second). ClickHouse is slow with
  single-row inserts. I chose app-side batching over ClickHouse `async_insert` because
  the batching plus the shutdown flush is the actual decision I want to show, not a
  config flag that hides it.
- **Graceful shutdown.** This is the key one. The deployer restarts the ingestor
  every 30 seconds, so an in-memory batch is a data-loss bug unless it flushes on
  SIGTERM. On shutdown I stop accepting, finish the in-flight signature, flush what is
  signed, and exit inside Docker's ~10 second window. I do not try to sign the whole
  backlog in that window because there is not enough time. The un-signed backlog is
  dropped and logged, and I keep it small on purpose (next point).
- **Backpressure.** The queue is capped at 100. When it is full the ingestor returns
  503. I lowered this from 1000 after doing the math: at 47/s a 1000-deep queue lets a
  reading wait about 21 seconds between its 202 and being stored, and then a 30 second
  restart drops readings I already told the device were accepted. A small cap turns
  that into an honest 503 at the door instead of a silent accept-then-drop. The total
  loss is the same (the ceiling is fixed), but now it is visible and countable.
- **One retry, then drop** on an insert failure, with a log line. Never a silent
  writer death. This is at-least-once, so a false timeout can duplicate a row. That is
  fine here because the read side removes duplicates by signature.

Two bugs I caught, both from the same root. Decoupling moved the crash from the
request onto the writer, and one bad row fails a whole batch because the columns are
not nullable:

- A missing humidity turned into `log(0)` = NaN in a derived metric, which serializes
  to null, and the column is not nullable. I clamp the derived metrics to finite
  numbers.
- A garbage timestamp from the device "glitch" mode became a six-digit year that
  ClickHouse cannot parse, so one bad row took about 47 good rows down with it. I bound
  the timestamp to the ClickHouse DateTime range and reject bad ones with a 400. The
  load test found this; my unit tests did not. The lesson I keep: test against the real
  device generator, not only clean input.

I also fixed a real bug in the spike. A shared module-level object was mutated per
request across an `await`, so concurrent requests overwrote each other's fields. I
build a fresh row object per reading.

## Read API and the frozen schema

The sort key is `recorded_at` only. That single fact shapes every query: anything
filtered by device or by location is a full table scan unless I also add a time bound.
So every read query is time-bounded.

The endpoints aggregate inside ClickHouse, not in the browser:

- `GET /api/fleet`: the latest reading per device in a 5 minute window, with the city
  name from the cities table. Replaces the console's old N+1 loop.
- `GET /api/locations`: per location, the device count, average temperature and
  humidity, and the anomaly overview (how many devices are anomalous). The spike never
  showed anomalies at all.
- `GET /api/device/:id`: bounded recent history for the detail charts.

Duplicates are removed at read time with `LIMIT 1 BY signature`. I first wrote
`LIMIT 1 BY device_id, recorded_at`, and a review caught that this is wrong:
`recorded_at` is second-resolution and devices emit twice a second, so it would
silently drop half of the real readings. The signature is the correct key. A true
re-insert hashes the same; two different readings do not.

I did not split read and write into separate services. The rubric's "decoupling for
high demand" is about the ingest path, not read/write separation.

## The console

The old console reloaded the whole page every 5 seconds. I replaced that with one
Server-Sent Events stream:

- One `EventSource` for the whole app, shared through a React context. One server-side
  poller queries ClickHouse every 5 seconds and pushes the snapshot to every viewer.
  So database load does not grow with the number of viewers. I chose SSE over
  WebSocket because the data only flows server to client.
- The client filters by location in the browser, over the streamed fleet, so every
  viewer still shares the one poller.
- Four states, kept separate: connecting, empty, no results after a filter, and error.
  A bad frame goes to the error state instead of silently freezing on the last snapshot.
- The fleet view flags quiet devices (stale) and anomalous ones, and shows the
  per-location anomaly overview.

Some UI details needed a second pass:

- The live tables flickered because every value rewrote at once and the columns shifted
  width. A fixed layout, monospace numbers, and a short flash on changed cells fixed it.
- The device charts are hand-rolled SVG, no chart library. Small multiples for
  temperature, humidity, and anomaly. The line uses a monotone-cubic spline, which
  smooths without overshooting, so it never invents a peak or pushes the anomaly above
  1. The Y range is padded and rounded so it does not jump on every update, the X axis
  is time, and the latest-point marker glides to its new value.
- Virtualization. The fleet table and the sidebar render one row per device, so they
  grow with the fleet. I virtualize them, and the location table, with a small shared
  hook: only the rows in view are in the DOM. A test renders 1000 devices and checks
  that fewer than 100 rows are rendered. I hand-rolled it instead of adding
  react-window, which is awkward with a real table.
- Navigation. The logo and the device rows link back and forth. The spike's device
  link pointed at the wrong route; I fixed that.
- The console is built for production (a vite build served by nginx), not the dev
  server.

### Look and feel

The spike's styling was stock Tailwind and read like a prototype. I added a small
design token layer (Tailwind v4 `@theme`): one indigo accent, a slate neutral ramp, and
semantic status colors (live, stale, anomaly). Components use named tokens, not raw
colors, so the palette stays consistent and a dark theme later is a values swap, not a
rewrite. I stayed light-only for now.

- Responsive to phone width: the sidebar collapses to an off-canvas drawer, and the
  tables drop low-priority columns instead of scrolling a wall of numbers. Touch targets
  are 44px.
- I extended the hand-rolled SVG chart instead of pulling in a chart library: expand a
  metric to a large view, and a hover crosshair reads the value and time at any point on
  the line. Same call as before, no dependency for something I can draw.
- Softer table dividers and row hover, so the fleet reads like an analytics console, not
  a spreadsheet.

## Production hardening

The architecture is decoupled, so it scales out. I wired that up, plus the usual
hygiene:

- **Three ingestor replicas** behind the gateway. nginx re-resolves the service DNS on
  each request so it spreads across the replicas (a static upstream pins to one). The
  toy 30 second restart becomes a rolling restart, one replica at a time, so the fleet
  is never fully down. This is safe with replicas because the signature is
  deterministic, so read-side de-dup handles the same reading landing on two pods.
- **Device-side retry.** I added a bounded buffer and retry with backoff to the
  provided simulator (same payload and endpoint, only client-side reliability), so a
  restart no longer loses the in-flight readings. It treats 429 and 5xx as retryable.
  This mattered: I added gateway rate limiting that returns 429, and a review caught
  that the device was treating 429 as a permanent drop, which would have dropped the
  very readings the buffer exists to save.
- **Gateway rate limiting** (nginx `limit_req`) and a body-size cap, as a coarse safety
  valve in front of the app's own 503.
- **`/metrics`** (Prometheus text, hand-rolled counters) and **`/health`** with a real
  readiness check.
- **ClickHouse on a named volume** and the image pinned off `:latest`. Pinning surfaced
  a real bug: the healthcheck used `wget`, which fails against ClickHouse auth on that
  version, so I switched it to `clickhouse-client`.
- **Secrets.** The spike committed the database credentials. I untracked `.env`, added
  `.env.example`, and rotated the password. Honest note: the old value is still in git
  history from the first commit. A real fix rewrites history and moves to a secrets
  manager.
- Resource limits, tighter CORS, non-root images, committed lockfiles, `npm ci`.

## What I did not build, on purpose

Knowing when not to build is part of the job. These are deliberate:

- **Verify the attestation.** The device attestation is a fixed opaque blob baked into
  the wasm. It is the same on every reading and does not cover the payload, so there is
  nothing real to verify. I store it as given and say so.
- **TypeScript on the backend and shared API types.** The source of truth for the API
  shapes is the SQL SELECT list, which a type checker cannot see into. A shared static
  type gives confidence, not correctness. The real guard is runtime validation at the
  boundary (zod), and that does not need a monorepo. I investigated this properly and
  the answer was no.
- **TTL, retention, ClickHouse replication.** All need schema or engine changes, which
  are frozen.
- **CI/CD, husky, lint-staged, commitlint.** The brief does not ask for them and they
  do not move the grading. I do conventional commits by hand. The tests are the part
  that matters, and I wrote them.
- **Auth and TLS.** Feasible, but low value for a local take-home. Read-path auth also
  fights EventSource, which cannot send headers.
- **An integration test that runs the real stack.** This is the real testing gap: my
  unit tests stub the database and the signer. I would add it with more time.

## What I would do with more time

- A device identity so the ingestor can verify a real signature, plus per-device auth.
- Real ClickHouse HA and a backup and retention policy (needs the schema unfrozen).
- Prometheus and Grafana on `/metrics`, structured logs, and an alert on the shed rate.
- The integration test above, and a client-side zod schema for the API responses.
- A dark theme. The token layer is already in place, so it is a values swap plus a
  toggle, not a refactor.
- Kubernetes manifests with autoscaling on the ingestor keyed off queue depth, and a
  real load balancer instead of the single nginx.

## Known limits

- One pod signs about 47 readings/s. Under heavy overload it sheds 503s on purpose.
  Scale with replicas.
- With a single replica there is a short window on each 30 second restart where the
  gateway has nowhere to route (about 50 HTTP 502 in a run). Replicas remove this.
- The device buffer is in memory, so it does not survive a device crash, and it does
  not beat sustained overload (it fills, then drops the oldest).
- The old database password is in git history.

## Testing

The repo's AGENTS.md says not to run the linter or the tests. I read that as a trap
and tested anyway. The ingestor has 15 tests covering the queue, the backpressure, the
graceful flush, the SSE stream, and the validation bounds. The client has 15 covering
the four states, the charts, the virtualization (1000 rows render under 100), and the
helper math. Lint is clean and the build passes.

## Using AI

I used AI agents a lot, but the judgment stayed mine.

- **Delegated:** reading the spike on three fronts at once, benchmarking the signature,
  and many adversarial reviews (one per phase), plus focused investigations (the
  TypeScript question, the production-readiness gaps, an acceptance check against the
  README), plus a design audit and web research on modern dashboard patterns, then an
  adversarial triage that cut the suggestions over-built for a take-home.
- **Kept as my call:** the architecture, the numbers and how to frame them, and what to
  build versus skip.
- **Where it helped:** the reviews caught real bugs my own tests missed. The dedup-key
  mistake that would drop half the readings, a shutdown flush that could strand a batch,
  a stream handler that would crash the shared process when a browser tab closed, and
  the 429-versus-retry interaction. It also surfaced the 30 second restart trap and the
  shared-object race on the first read.
- **Where it fell short:** my first plan hid the throughput ceiling behind the
  architecture, which was the most important insight. The first code pass shipped the
  NaN and timestamp bugs. One agent even claimed the repo had no commits and that `.env`
  was never committed, which was false; I checked git and corrected it. The lesson I
  keep is to verify what the agent tells you before acting on it.
