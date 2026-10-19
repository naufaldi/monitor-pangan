# PIHPS data and cron audit

Verified on 19 October 2026 against the existing production Worker and D1. All remote operations were read-only. No production rows, triggers, or deployments changed.

Record timestamp: 2026-10-19T07:50:10Z (14:50:10 Asia/Jakarta). Remote observations were collected earlier in this same execution session; this timestamp records the audit handoff, not a claim that every request ran at the same instant.

## Production D1

The official `pihps` / `eceran` rows contain 8,040 non-null provincial cells across 24 dates, from 2026-09-16 through 2026-10-19. No earlier year appears in the per-year coverage query. The specific historical regression dates 2018-10-09 and 2025-10-30 have no stored rows. The 2026-09-16 control has 310 cells.

There are 23 `source_days` entries from 2026-09-17 through 2026-10-19, all marked live. They cover every weekday in that interval. The 2026-09-16 seeded price rows have no corresponding day marker; price presence and source-day metadata must be audited separately.

Job history contains 47 `complete` records and 8 legacy `failed` records. Future health reads must normalize legacy `failed` to an error outcome, alongside new `error` records. A recent maximum price date alone does not prove historical completeness or successful automation.

The audit used the read-only SQL in the approved plan through `pnpm exec wrangler d1 execute monitor-pangan --remote --command ... --json`. Wrangler reported zero changed rows and `changed_db: false` for the queries.

## Deployed triggers and job evidence

The deployed schedules API returned `15 7 * * 1-5` and `15 10 * * 1-5`, created on 28 September and modified on 14 October. Times are 14:15 and 17:15 WIB. Cloudflare's cron weekday numbering makes this Sunday through Thursday.

Stored jobs corroborate the weekday mismatch:

- Friday 2026-10-16 was ingested on Sunday 2026-10-18 at 07:15 UTC.
- Friday 2026-10-09 was ingested on Sunday 2026-10-11 at 07:15 UTC.
- Friday 2026-10-02 was ingested on Sunday 2026-10-04 at 07:15 UTC.
- Monday 2026-10-19 was ingested on that Monday at 07:15 UTC.

The second trigger usually records a zero-row caught-up invocation. Existing selection starts after the latest recorded day, so it cannot refresh a completed current day or find an earlier gap hidden by a newer marker.

The public freshness endpoint returned HTTP 200, latest date 2026-10-19, 23 dates and 7,730 cells after the 2026-09-16 bundle cutoff. This verifies serving fresh rows; the separate database/job/trigger observations establish how they arrived.

## Recovered repository archive

The user did not know a raw archive location and asked to check the codebase. No raw archive or yearly snapshot files were present in the root checkout; Spotlight lookup found no matching historical raw file. Full derived history is committed on PR #14 at immutable commit `ef85f27904b044bd343a56dcdd77a46d28eb1205`, paths `public/series/2017.json` through `public/series/2026.json`.

These files were extracted to ignored local staging and validated with Effect Schema: canonical sorted unique weekday dates, exact ten commodity groups, all 38 province columns plus the derived national column, matching column lengths, and positive finite provincial prices or null. The archive contains 2,455 dates from 2017-03-27 through 2026-09-23 and 793,386 non-null provincial cells. National columns are derived and must not be imported as provincial observations or used to replace the current Rp 50 mean policy.

Comparison with the current generated bundle found 9,800 overlapping observed cells. Of these, 9,790 match exactly. The ten differences are all Kalimantan Timur (`64`) on 2026-09-16, one per commodity. This is a real discrepancy, not proven source revision. Preserve existing observations; restrict the proposed historical repair to dates before 2026-09-16, so none of the disputed cells or newer production data is overwritten.

The recovered data is a derived repository archive, not the original PIHPS raw HTTP responses. Fixture/import provenance must retain that distinction and pin the commit and original path. Restoring these data files does not merge PR #14's code or change its mean/percentage policies.

[repair-manifest.json](repair-manifest.json) is the machine-readable handoff. It pins each yearly file by SHA-256 and includes all 2,449 proposed repair dates, 791,426 proposed non-null provincial cells, and 23 omitted weekdays. The repair interval is 2017-03-27 through 2026-09-15 inclusive. No known production date is in that interval. An actual database import still requires the generator's row-level conflict/dry-run checks at execution time.

The per-year archive counts (dates / non-null provincial cells) are: 2017: 194 / 46,813; 2018: 257 / 83,282; 2019: 260 / 84,528; 2020: 260 / 83,010; 2021: 257 / 84,362; 2022: 254 / 83,742; 2023: 260 / 86,780; 2024: 262 / 88,069; 2025: 261 / 88,340; 2026 through September 23: 190 / 64,460. These describe the complete recovered files; the proposed repair excludes September 16 onward.

Weekday comparison found 23 omissions between the archive's first and last dates. They remain **unknown**, not confirmed empty holidays: no original HTTP scope statuses were recovered. The exact dates are in the manifest. The 2,449 repair dates prove recorded observations exist, but do not prove every provincial HTTP request succeeded. Therefore derived-file recovery imports price observations only and must not manufacture historical completed `live` or `empty` records in `source_days`. Only independently verified source checks can establish those operational markers. Price reads can serve known observations without pretending the original scrape's scope completeness is known.

Archive examples: Jakarta beras is 13,200 on 2018-10-09 and 16,300 on 2025-10-30. The archive's nearest-rupiah national figures are 11,707 and 15,769 respectively; PR #12 retains Rp 50 rounding, yielding 11,700 and 15,750 when computed from the provincial observations.

Two direct PIHPS source spot checks returned HTTP 200 and matched those archived Jakarta values: `GetGridDataDaerah`, traditional-market price type 1, report type 1, province 13, and the respective single historical date. This corroborates the two source fixtures; it does not independently reverify every archived province/date.

An export of the existing `prices_daily` table was saved in ignored local staging for Worker/D1 checks. This export may briefly pause D1 queries while Cloudflare takes its snapshot; it completed successfully. No writes or production imports were issued. The export download credential is not included in committed evidence.

## Remaining production work

The historical repair is necessary for the audited pre-2026-09-16 gap, but has not been applied. Generate an explicit-range dry run, validate locally, and review the proposed SQL/counts before any production import. Correcting deployed triggers and deploying the rebuilt Worker also remain separate rollout actions.
