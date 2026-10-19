-- Read-only. Select --local or --remote explicitly when invoking Wrangler.
SELECT substr(date, 1, 4) AS year, COUNT(*) AS cells,
       COUNT(DISTINCT date) AS dates, MIN(date) AS first_date, MAX(date) AS last_date
FROM prices_daily
WHERE source_id = 'pihps' AND level = 'eceran' AND price IS NOT NULL
GROUP BY year ORDER BY year;

SELECT date, status, checked_at FROM source_days
WHERE source_id = 'pihps' ORDER BY date DESC LIMIT 40;

SELECT started_at, status, rows_upserted, note FROM job_runs
WHERE source_id = 'pihps' ORDER BY id DESC LIMIT 20;

-- Daily period begins strictly after STATIC_LIVE_THROUGH = 2026-09-16.
-- A newer marker cannot hide an older missing/pending/error weekday.
WITH RECURSIVE eligible(date) AS (
  SELECT '2026-09-17' WHERE '2026-09-17' <= date('now', '+7 hours')
  UNION ALL
  SELECT date(date, '+1 day') FROM eligible WHERE date < date('now', '+7 hours')
)
SELECT e.date, COALESCE(s.status, 'missing') AS status, s.checked_at
FROM eligible e LEFT JOIN source_days s ON s.date = e.date AND s.source_id = 'pihps'
WHERE strftime('%w', e.date) BETWEEN '1' AND '5'
  AND (s.status IS NULL OR s.status NOT IN ('live', 'empty'))
ORDER BY e.date;

SELECT date, commodity_id, COUNT(*) AS cells, COUNT(price) AS priced_cells
FROM prices_daily WHERE source_id = 'pihps' AND level = 'eceran'
  AND date IN ('2018-10-09', '2025-10-30', '2026-09-16')
GROUP BY date, commodity_id ORDER BY date, commodity_id;
