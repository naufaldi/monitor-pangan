# PIHPS incremental archive operations

Implementation for issue #38. Production deployment, credentials, bootstrap,
automation activation and actual scheduled-event evidence remain pending.
The [ingestion runbook](pihps.md) and [production rollout checklist](../qa/pr12/production-rollout.md)
still govern deployment and historical production backfill.

## Ownership and publication

The existing Worker is the only scheduled PIHPS fetcher: weekdays at 14:15 and
17:15 WIB (`15 7 * * MON-FRI`, `15 10 * * MON-FRI`). A changed successful day
publishes a canonical D1 snapshot to `pihps_archive_events` in the same transaction
as the price refresh and source marker. Unchanged observations/references create
no event, regardless of the attempt timestamp. Failed final transactions create
no event; confirmed insert-only cells and previously good prices remain intact.

GitHub Actions polls this outbox at proposed 14:45 and 17:45 WIB
(`45 7 * * MON-FRI`, `45 10 * * MON-FRI`). This is an export schedule, not another
PIHPS ingestion scheduler. GitHub scheduling can be delayed. Each run processes
up to 100 immutable events, 25 per page and 20 MiB total, with 30-second API
timeouts and at most two transport retries. A bounded run reports its remaining
backlog. The epoch/watermark are read together, every page includes its actual
epoch, and a final check rejects a database reset before publication.

The publisher runs trusted `main` code and reads the bot branch as data. It
validates the complete archive and keeps a single PR from
`automation/pihps-history` into `main`. Publication uses an expected remote SHA;
overlapping/stale publishers abort rather than replace another writer's data.
Pending events are preserved even when the previous PR merged and creation of
the next PR failed after a successful push. Identical work creates no commit.
Reviewers own merging. A manually closed, unmerged PR blocks publication until
the owner resolves it; the bot does not recreate a rejected proposal.

## Format and provenance

The #37 root year files and manifest remain the immutable audited recovery base.
`updates/YYYY.jsonl` contains canonical version-1 events ordered by sequence,
partitioned by survey year. A correction to 2018 can appear after a 2026 event.
The update manifest pins the base manifest hash and contains epoch, checkpoint,
file hashes, byte sizes, counts and date ranges. Export-run timestamps belong
only in operational receipts, never in committed archive metadata.

Each event records a D1 capture time, kind and sorted observation tuples.
`daily_ingest` records the successful source-day check separately from retained
observations; it does not claim every retained cell was fetched in that attempt.
`d1_reconciliation` has unknown source completion. Neither contains original HTTP
responses. A `pihps-grid:YYYY-MM-DD:region` reference identifies the existing
PIHPS grid request's survey date and Kemendagri province; the Worker maps that
province to BI's scope ID. It is a request identity, not an archived response.
Safe derived Git references remain intact; absent references restore as
`d1:pihps:<epoch>:<sequence>`.

Validation rejects invalid/duplicate/unsorted observations, invalid dates/prices,
unsafe references, unknown fields, corrupt/truncated JSONL, epoch conflicts,
unexpected files and symlinks. Updates override matching base keys by sequence;
omissions never erase existing observations. Restoring into D1 continues to keep
official rows already in the target and rejects other-source key collisions.
Restoration writes no source-day/job/citizen metadata. An existing target price
is not forcibly corrected by a recovery import.

## Setup and rollout boundary

Prepare the change and run local verification before configuring production.
For an authorized rollout:

1. Read the actual Worker/D1 identity, deployed triggers, account usage/quota and
   fresh official observations. Review additive DDL and bootstrap ranges/counts.
2. Deploy the journal-capable Worker. Confirm schema and successful outbox
   recording, preserving the existing daily source budget.
3. Reconcile predeployment observations in reviewed ranges of at most 31 calendar
   days. Include September 16 onward and known differences on older dates. This
   reads D1, never refetches the historical source. Measure row/index/event writes
   and remaining quota before applying. Historical backfill from #36 remains
   separate; missing production rows never remove repository base observations.
4. Create a GitHub environment `pihps-archive`. Set repository variable
   `PIHPS_ARCHIVE_SYNC_ENABLED=true` only when activation is authorized. Add
   environment variables `CLOUDFLARE_ACCOUNT_ID`, `PIHPS_ARCHIVE_APP_ID` and
   `PIHPS_ARCHIVE_BOT_LOGIN` (the exact installation actor, e.g. `<app-slug>[bot]`).
   Add private secrets `PIHPS_ARCHIVE_D1_READ_TOKEN` and
   `PIHPS_ARCHIVE_APP_PRIVATE_KEY` using the platform's secret entry UI.
5. The Cloudflare token needs D1 Read on the intended account, with the narrowest
   available resource scope. Export code pins database
   `2bfc02d3-5eaf-4c7c-999b-e8e77544be21`. A separately authorized reconciliation
   needs a D1 write-capable credential; the ordinary exporter does not receive it.
   Install the GitHub App only on this repository with Contents and Pull requests
   write permissions. Tokens stay in the runner, never in the Worker or browser.
6. Run a controlled export, inspect its PR/validation, and merge through normal
   review. Read back actual Worker triggers and GitHub workflow settings.
7. Observe a real subsequent scheduled Worker event and export. Match event
   time, survey date, prices, source marker, job, outbox event, workflow receipt
   and PR. Capture unchanged-run evidence separately. Manual fixtures and a
   checked-in cron are not proof of production scheduling.

## Bounded local and manual commands

Use Node 24 and pnpm. Start from an explicit target and validated archive.
Local examples are read-only on D1 except the explicitly named reconciliation
apply. Local sync writes only repository archive files unless `--dry-run`.

```sh
rtk pnpm history:pihps:sync --target local --existing-db /absolute/path/to/source.sqlite --max-events 100 --dry-run
rtk pnpm history:pihps:sync --target local --existing-db /absolute/path/to/source.sqlite --max-events 100
rtk pnpm history:pihps:status --target local --existing-db /absolute/path/to/source.sqlite
rtk pnpm history:pihps:reconcile --target local --existing-db /absolute/path/to/source.sqlite --from 2026-09-16 --to 2026-09-30 --dry-run
rtk pnpm history:pihps:reconcile --target local --existing-db /absolute/path/to/source.sqlite --from 2026-09-16 --to 2026-09-30 --apply
```

Reconciliation defaults to dry run. `--apply` and `--dry-run` cannot be combined.
It records current D1 snapshots as observations with unknown source completion;
it never modifies prices, source markers or jobs. Repeating it adds no identical
events. Direct SQL corrections that bypass the journal require reconciliation.
This feature exports corrections already stored in D1; it does not discover
never-fetched historical changes at PIHPS.

After authorized workflow activation, retry export alone:

```sh
rtk gh workflow run pihps-history-sync.yml --ref main -f max_events=100
rtk pnpm history:pihps:status --target remote
```

Remote status requires D1 Read configuration in `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, authenticated GitHub read access and the expected
`PIHPS_ARCHIVE_BOT_LOGIN`. Do not paste credentials into commands or chat.
Do not rerun ingestion to recover an archive export failure.

## Status, lag and failure recovery

`history:pihps:status` reports D1, published and merged checkpoints independently.
`unpublishedEventCount` measures export backlog; `unmergedEventCount` includes
pending review. `exportLagSeconds` is the oldest event not published;
`archiveLagSeconds` is the oldest event absent from `main`, including old-date
corrections. Counts use actual events, not arithmetic on possibly sparse sequences.
`awaiting_review` is not caught up on `main`.

Last export success comes from an actual successful export step in the last
20 completed workflows, including workflows that failed during later artifact
upload or cleanup. A skipped workflow's conclusion does not establish export
success. Older evidence outside this bounded lookup remains unknown. The latest
attempt is independent of the last success.
GitHub metadata outages yield `unavailable` while preserving independently known
checkpoints, computable backlog and last readable success. Unknown checkpoints
and their dependent counts/lag stay null. A validated empty archive has checkpoint
zero; an unreadable archive does not.
This command does not change `/api/pihps/health` ingestion semantics.

Sanitized receipts are written to ignored
`data/repairs/pihps-archive-receipt.json`, workflow summaries and 30-day Actions
artifacts. They contain sequence ranges, result, archive hash and PR URL, with no
SQL, response bodies or credentials. Artifacts are evidence, not the only cursor:
validated manifests on `main` and the bot branch determine retry progress.

An export/API/Git failure preserves D1 and the last published archive. Fix access
or branch conflicts, then rerun the bounded workflow. A closed unmerged PR needs
an explicit repository-owner decision. Never remove a publication lock without
checking for a live writer and retaining crash-recovery staging/backup evidence.

An epoch mismatch means the database was reset/reinitialized. Stop ordinary
sync, audit the replacement database against the archived epoch, and prepare a
reviewed reinitialization/reconciliation migration. Never silently relabel old
events with the new epoch or reset the archive checkpoint.

Outbox events are retained in this version. Monitor table bytes, event counts,
JSONL growth and D1 row/index writes. A full 340-cell day records one snapshot
event; an unchanged retry records none. Pruning requires verified merged
checkpoints and a separate reviewed retention design, never an open PR cursor.

Local evidence and screenshots: [issue #38 verification](../qa/issue-38/verification.md).
