# National mean is the surveyed provinces

## Status

Accepted

## Context

PIHPS publishes a national row beside the provincial rows. That row can disagree with a mean of the provinces, and it still moves when the set of provinces with a harga changes. Several provinces are tidak disurvei on a given hari perdagangan. Showing their absence as a number, or letting them affect the mean, would present a harga that was not surveyed.

## Decision

Rata-rata nasional is the arithmetic mean of provincial harga that exist that day, rounded to the nearest rupiah. The PIHPS national row is not the headline figure. Perubahan harian and perubahan tahunan for that mean use only provinces that have a harga on both anchor days.

## Consequences

The number on the map can differ from the national cell on the PIHPS site. Week and month points are means of these daily means, not means of the PIHPS national cell. A day with no surveyed province has no rata-rata nasional.
