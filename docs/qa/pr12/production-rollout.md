# Production rollout checklist: pending authorization

No production import or deployment was performed. Local runtime evidence is in
[runtime-verification.md](runtime-verification.md); the reusable commands and
scope rules are in the [PIHPS runbook](../../operations/pihps.md).

Target must remain explicit: Worker `monitor-pangan`, D1 `monitor-pangan`, database
`2bfc02d3-5eaf-4c7c-999b-e8e77544be21`, origin `https://monitor.naufaldi.com`.
Confirm the Cloudflare account and bindings before planning any remote change.
Do not upgrade a plan automatically or infer account tier from database size.

- [ ] Record fresh remote audit time, year/date/commodity/province counts, source-day
  states, recent jobs, current Worker version and actual deployed Cron Triggers.
  Use read-only `docs/operations/pihps-audit.sql` and the trigger readback in the
  runbook. The October 19 audit is a baseline, not a perpetual description of production.
- [ ] Verify the actual account tier, current D1 read/write usage, remaining quota,
  per-database size and total account storage. Check current official
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
  [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), checked
  19 October 2026. Free allows 100,000 rows written/day, 500 MB per database and
  5 GB account storage; index writes also count. The 791,426 historical inserts
  alone exceed one free daily write allowance. Measure index/DDL overhead and
  leave daily ingestion headroom. Account tier and available quota are **unverified**.
  Agree a budgeted, date-scoped staged repair when needed; no plan upgrade is assumed.
- [ ] Save fresh complete remote price and coverage baselines under durable ignored
  `data/repairs/` paths. Preserve the export order/checksum and target identity.
  Confirm immutable archive provenance and hashes. Never replace these with the
  restored local baseline or infer completion markers from derived prices.
- [ ] Generate remote-labeled dry-run SQL only for proven gaps and an explicit
  reviewed range. Inspect inserts, updates, conflicts, source ownership, preserved
  newer observations, coverage changes, statement sizes and quota estimate.
  Derived-history coverage changes must remain zero; keep September 16 onward
  and citizen D1/R2 data outside the historical repair.
- [ ] Apply that exact proposed repair to an isolated local copy of the fresh
  remote baseline. Verify both 38-cell regression fixtures, mean/counts, provenance,
  recent checksum, job/source-day preservation, and repeat application with zero
  effective writes. Local evidence already proves the earlier audited baseline;
  redo planning when current production differs.
- [ ] Review the concrete target/range/SQL/report and rollback/backup path. Obtain
  authorization for production import and Worker deployment before either runs.
- [ ] Apply only the reviewed scoped SQL within verified quota, capturing chunk
  results. Pause on conflicting source, quota, or partial failure; audit actual
  committed chunks before regenerating the remaining plan. Read back actual
  remote fixture cells, coverage counts and unchanged recent checksums.
- [ ] Deploy the existing Worker with the required checks passing. Record the
  deployed version/time. Read back actual trigger settings and verify exactly
  `15 7 * * MON-FRI` and `15 10 * * MON-FRI`; configuration in Git is insufficient.
- [ ] Read deployed historical snapshot, sparse paginated trend, fresh/health JSON,
  HTML/assets, citizen routes and admin noindex/auth behavior. Distinguish checked
  survey dates from priced dates and confirm no gap was concealed by a newer max.
- [ ] Observe the next available **actual scheduled event** after deployment.
  Match UTC/WIB event time, chosen survey date, terminal log outcome, `job_runs`,
  `source_days`, written cells and health. Keep this pending until the event occurs;
  a manual handler check, future timestamp or readable prices cannot replace it.

Account verification, fresh remote audit, reviewed production SQL, production
apply, deployment, trigger readback and future event observation are all pending.
The replacement draft PR remains a code-review artifact, not rollout approval.
Keep the original draft #12 open until its replacement merges.
