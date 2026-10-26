# Household food-basket estimate

Related issue: [#55](https://github.com/naufaldi/monitor-pangan/issues/55).

Status: first-version implementation contract for `/keranjang`.
The user authorized implementation and merge on 26 October 2026. Application deployment remains manual.

## Audience and purpose

User story: As a household reader, I want to enter commodity quantities and compare estimated costs for my province.

Help a household reader estimate the cost of quantities they choose for one province.
Use provincial PIHPS retail averages for the ten existing commodity groups.
Label every result as an estimate. A shop can charge a different price.

The basket does not prescribe household consumption, nutrition, or a shopping period.
It is not a verified cost-of-living index. Citizen reports and wage inputs do not enter the calculation.

## First version

| Decision | Behavior | Reason |
| --- | --- | --- |
| Quantities | Start with ten empty fields. Let the reader enter quantities. | Household size and buying habits are unknown. |
| Units | Use kg for nine commodities and liter for cooking oil. Show the unit beside each input. | Units follow the existing commodity catalog. |
| Input range | Accept quantities from 0 through 1,000, with at most two decimal places. | This bounds arithmetic while allowing small quantities. |
| Empty and zero | Empty or zero excludes the commodity. At least one positive quantity is needed for an estimate. | An empty basket must not imply a zero-cost household basket. |
| Dates | Use one selected survey date for every current price. Default to the latest available survey date. | A total must not silently combine prices from different dates. |
| Comparison | Default to the immediately preceding available survey date. Let the reader choose an earlier available date. | Both totals use the same province, commodities, and quantities. |
| Missing prices | Show available line costs and identify missing selected items. Withhold a total for an incomplete date. | A subtotal must not appear to be the whole basket cost. |
| Persistence | Offer explicit Save and Clear actions for one basket on this device. | Saving stays under the reader's control and needs no account. |
| Sharing | Defer quantity sharing through URLs. | The first version can provide useful estimates without publishing household choices in links. |

These defaults are product choices, not evidence of user research.

## Quantity entry and calculation

Accept decimal comma or decimal point, such as `0,25` and `0.25`.
Allow surrounding whitespace. Reject grouping separators, mixed separators, signs, exponents, and more than two decimal places.
Reject negative values, values above 1,000, nonnumeric text, NaN, and Infinity.
Show an error beside the field. Do not silently clamp, truncate, or reuse its previous valid quantity.
An invalid field prevents totals and saving until the reader corrects it.

Represent a valid quantity as integer hundredths of its catalog unit.
For each selected commodity, multiply its quantity by the observed price for the selected province and date.
Round each line cost to the nearest rupiah. Round an exact half rupiah upward.
Sum the rounded line costs so the displayed total equals the displayed lines.
Keep kg and liter separate. Never display their sum as a combined quantity.

For example, synthetic prices of Rp15,000/kg and Rp20,000/liter produce these estimates:

- Rice at 2 kg costs Rp30,000.
- Cooking oil at 0.5 liter costs Rp10,000.
- The complete basket costs Rp40,000.

Label such fixtures as synthetic test values. Do not present them as official observations.

## Dates, coverage, and comparison

Select dates from the existing live survey-date list. Do not derive a survey date from the browser clock.
Show the actual current and comparison dates beside their totals.
Do not substitute another date for a commodity whose price is missing.
Do not substitute a national average for a missing provincial price.
Do not use mock prices in a basket presented as a PIHPS estimate.

An unselected commodity cannot make the basket incomplete.
A selected commodity with a missing, invalid, or failed price makes that date incomplete.
Keep request failures distinct from confirmed missing observations and offer retry for failures.
An error or late response from an older selection cannot populate the current basket.

The current total may appear when all its selected prices are available, even if comparison prices are incomplete.
Show an absolute and percentage change only when both totals are complete and the earlier total is positive.
Calculate percentage change from the same rounded totals displayed to the reader.
If no earlier survey date exists, show the current estimate and explain that comparison is unavailable.
Changing quantities recalculates both totals with the same new quantities.

## Saving and privacy

Store one versioned basket in local browser storage only after the reader selects Save.
Store the province, quantities, and selected dates. Do not store price snapshots or derived totals.
On restore, validate the complete saved shape and recalculate with available observations.
If a saved date is unavailable, explain the problem and require a new selection before calculating that total.
An invalid saved basket cannot silently become a different valid basket.

Storage denial must not prevent an estimate. Explain that saving is unavailable and retain the current form in memory.
Clear removes only this feature's saved basket and resets its quantities and dates.
The selected province remains the navigation context.
No account, server storage, analytics payload, citizen alias, private receipt, or photo belongs in this flow.

## Existing building blocks

- `src/data/catalog.ts` defines the ten commodities and their units.
- `src/lib/province-overview.ts` loads exact-date snapshots with bounded concurrency and a bounded cache.
- `src/data/price-request.ts` prevents canceled requests from replacing the current selection.
- `src/data/price-schema.ts` validates external price data and civil dates.
- `packages/ui/src/index.ts` exports the shared inputs, cards, selectors, status messages, and layout components.

Do not copy the purchasing-power page's per-commodity latest-date selection.
That behavior can mix survey dates within a basket.

## Definition of done and verification

The `/keranjang` page supports the rules above through shared UI, verified calculations, and inspected browser behavior.
Delivery includes a checked PR merged into `main`. It excludes application deployment.

1. Prove quantity parsing, limits, rounding, and exact summation with focused behavioral tests.
2. Prove complete, empty, invalid, and incomplete baskets. Cover missing current and comparison observations independently.
3. Prove that national prices, different dates, unknown commodity IDs, and mock data cannot fill missing provincial prices.
4. Validate stored input at the external boundary. Cover malformed data, unknown versions, unavailable dates, and denied storage.
5. Inspect the actual desktop and 390px browser flow, including labels, keyboard entry, Save, Clear, reload, retry, and rapid selection changes.
6. Count snapshot requests. Permit at most twenty missing snapshot reads for two dates, with at most three in flight.
7. Quantity edits and province switches reuse loaded snapshots without additional price requests. Load no historical series for this calculation.
8. Run typecheck, explicit affected test files, and the production build. Inspect the final diff and final-head CI before merging.

The implementation must follow the Effect conventions and shared UI rules in the repository instructions.
Application deployment stays manual. Turnstile and photo proof in #44 and #46 remain separate.

Browser evidence uses the actual production bundle with local synthetic HTTP prices.
The [desktop capture](../qa/issue-55/desktop.png) and [390px capture](../qa/issue-55/mobile.png) show a test basket after restoration.
The synthetic rice and oil quantities total Rp40,000 on 23 October and Rp37,500 on 22 October.
These captures do not establish production price freshness or a deployment.
