# Controlled scheduler verification

Executed locally on 19 October 2026 with:

```sh
rtk pnpm exec node --experimental-strip-types docs/qa/pr12/verify-cron.mjs
```

The reproducible driver invokes production `handleScheduled()` with a controlled
`PihpsSource`, Effect `TestClock`, the production D1 store SQL and isolated real
SQLite. Health is read through production `handleRequest()` and `workerLayer()`.
It does not use the seeded application database, issue source HTTP, or call
Wrangler's uncontrolled `/cdn-cgi/local/scheduled` endpoint. Each isolated database
is closed after capture. [Raw sanitized JSON](cron-verification.json) records
requested dates, terminal jobs, day states, invocation outcomes and health.

| Scenario / controlled UTC trigger | WIB | Selected date | Calls | Outcome, stored state and health |
| --- | --- | --- | --- | --- |
| Friday, 2026-10-16 07:15 | 14:15 | October 16 | 34 | Resolved, 34 synthetic cells, `live`, job `complete`, health 200 `ok` |
| Monday, 2026-10-19 07:15 | 14:15 | October 19 | 34 | Skips weekend, resolved, `live`, job `complete`, health 200 `ok` |
| Delayed Monday, 07:15 then 10:15 | 14:15 then 17:15 | October 19 both times | 34 + 34 | First zero cells: `pending`, complete job, 200 `waiting`; then published: `live`, complete job, 200 `ok` |
| Failed Monday, 2026-10-19 10:15 | 17:15 | October 19 | 5 | First concurrent source batch fails; invocation `PihpsFetchError`, `error` day/job, health 503 `degraded` |

All source calls selected the expected day. No failed run is relabeled successful
because its error job was saved. Day evidence and invocation evidence remain
separate: a successfully checked zero-cell current day is pending even with a
complete job. The delayed second check recovers the same day rather than skipping
it. Source requests are synthetic, so these values are never imported as official
observations.

The explicit scoped gate also exercised the actual default `worker.scheduled`
`waitUntil` wrapper: coverage storage failure rejects its promise and stores an
error job (`src/worker/index.test.ts`). This provides wiring evidence separately
from controlled handler/state evidence. Actual local HTTP serving was verified
through Wrangler 8787 in [runtime-verification.md](runtime-verification.md).

Production events: none invoked or deployed by this verification. The earlier
[production audit](data-audit.md) is historical read-only evidence of the old
schedule. Corrected deployed `MON-FRI` triggers and the next actual scheduled
execution remain pending under the [rollout checklist](production-rollout.md).
A controlled Friday clock is not proof that a Cloudflare Friday event fired.
