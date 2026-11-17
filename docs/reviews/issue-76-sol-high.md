# Issue #76 review — Previous survey date

**Verdict: APPROVE.** No blocking product defects found. The implementation satisfies the supplied issue contract. One nonblocking documentation correction is noted below.

## Review identity and scope

| Item | Reviewed value |
| --- | --- |
| Issue | [#76](https://github.com/naufaldi/monitor-pangan/issues/76) |
| Reviewer | GPT-6.1 Sol, high reasoning effort |
| Implementer | Qwen4-Max, high reasoning effort |
| Branch | `fix/previous-survey-date` |
| Base | `3a6a97196b4a6343b6dfae4186ebbc909c6116ef` |
| Head | `947744277d3bc9d43cf07f21c28b0cc20fa79783` |
| Worktree | `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4` |

Verified the worktree root, origin, branch, exact head, clean status, and four-file base-to-head diff. Reviewed:

- [DatePicker.tsx](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4/src/components/DatePicker.tsx)
- [survey-date.ts](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4/src/lib/survey-date.ts)
- [survey-date.test.ts](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4/src/lib/survey-date.test.ts)
- [Implementation plan and deviations](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4/docs/plans/issue-76-qwen-high.md)

Read supporting caller, provider, schema, civil-date, shared-component, and project guidance. This was one read-only review pass. No files, Git metadata, dependencies, or running services were changed.

## Correctness and regression assessment

The reverse scan returns the latest available date at or before a valid target. Exact dates remain unchanged. Invalid input, an empty list, and targets before the earliest observation return `null`. The picker suppresses `onChange` for that result.

The ascending-date assumption holds for both current callers: home uses `provider.dates()`, which delegates to `liveSurveyDates()`; province uses `liveSurveyDates()` directly. That function sorts and deduplicates its result. Fixed-format civil dates support chronological string comparison.

Home retains URL ownership through `tanggal`. Province retains local `pinnedDate` ownership. The patch preserves native bounds, the empty-list guard, previous/next/latest handlers, and `showPicker`. It continues using shared `Button` and `Input` components without introducing another primitive or styling pattern.

The tests cover the original Sunday failure, exact-date preservation, a missing weekday, after-latest behavior, invalid dates, no predecessor, and an empty list. They assert observable results rather than the scan’s implementation. No security-boundary change or new external operation was found.

## Findings

### Low — Git exclusion scope is described incorrectly

**Location:** [docs/plans/issue-76-qwen-high.md:169](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5dd92e79-b38c812eb35af7f4/docs/plans/issue-76-qwen-high.md:169)

**Trigger:** Reusing the dependency symlink setup documented in deviation 6.

**Expected:** Describe `info/exclude` as shared repository metadata.

**Actual:** The plan calls it “worktree-local.” Running `git rev-parse --git-path info/exclude` in the reviewed worktree resolves to `/Users/naufaldi.satriya/WebApps/monitor-pangan/.git/info/exclude`.

**Impact:** Maintainers could misunderstand the isolation of that exclusion. This does not affect date resolution or block approval.

**Action:** Correct the description. No exclusion changes are requested.

No actionable product bugs or material missing proof block this bounded fix. Missing terminal newlines are optional formatting cleanup.

## Evidence reused and checks performed

I inspected the existing evidence without rerunning tests, typecheck, or build:

| Evidence | Assessment |
| --- | --- |
| `red-survey-date-test.log` | Three of four tests failed for the intended old behavior, including Sunday returning Monday instead of Friday. |
| `green-survey-date-test.log` | Four of four tests passed in the assigned worktree. |
| `baseline-civil-date-test.log` | Existing civil-date tests passed, two of two. |
| `typecheck.log` | Recorded `pnpm typecheck` completed without reported errors. |
| `build.log` | Recorded production build completed and prerendered nine pages. |
| Four screenshots | Opened and inspected all four. Home changes from 14/09 to 11/09 at matching desktop dimensions; province displays 11 September locally; mobile capture displays 11/09. |
| `dev-server.log` | Confirms missing-worker connection failures before and after the fix, plus server termination. |

Evidence directory: [issue-76 artifacts](/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue-76).

Reviewer checks were static diff/source inspection, Git identity/status checks, log inspection, and image inspection. No additional execution was needed to resolve a concrete concern. The final worktree status remained clean.

## Result and performance dispositions

**Result: PASS for the scoped local fix.** Code, regression evidence, and inspected captures support backward resolution and visible observed dates. CI, production, and deployment are outside this evidence.

**Performance: NOT MATERIALLY AFFECTED.** Resolution remains a synchronous, worst-case linear scan of an in-memory list, with an early exit. String comparison replaces repeated date parsing. The patch adds no request or backend work. This is a code-based assessment, not a measured speedup.

## Proof limits

- Date entry used the native value setter plus a synthetic input event. This supports application-handler behavior, but does not prove physical native-calendar selection.
- The mobile capture represents a 393×852 CSS viewport. Reported `maxTouchPoints === 0` means true touch behavior remains unverified.
- No throttled-3G evidence exists. The resolver adds no network dependency; downstream price loading remains outside the changed logic.
- The local worker was unavailable. Logs confirm connection refusal, and captures show baked prices with a freshness warning. Live backend freshness and API health were not established.
- Screenshots cannot establish button sequences or URL transitions. Qwen reports real previous/next/latest clicks; I verified those handlers and state owners in source, but did not independently verify the reported click lifecycle from an interaction trace.

These limits do not demonstrate a defect in the changed resolver.

## Qwen plan and execution assessment

The plan identifies the failure mechanism, state owners, sorted-input assumption, no-predecessor rule, and relevant proof before implementation. Its detail exceeds what the small patch needs, but the decisions are coherent and the retained change stays focused.

The final diff follows the planned four-file scope. Red-to-green evidence demonstrates useful regression protection. Reported rework concerns browser tooling and date-entry automation; the supplied evidence shows no design churn or broader product changes.

The deviations disclose native-entry, touch, network, and backend limits. The exclusion-scope statement needs correction, and “fully exercised” should be read within the disclosed automation limits.

The useful engineering lesson is specific: historical selection needs an ordered predecessor rule. Absolute distance can select a future observation even when a valid earlier survey exists.

## Parent disposition after review

- The review above is preserved as returned by Sol high for implementation head `947744277d3bc9d43cf07f21c28b0cc20fa79783`.
- Parent corrected the plan's exclusion description to shared repository Git metadata. No exclusion entries changed during this correction.
- Parent clarified the phrase "fully exercised" to refer to the recorded automation, preserving the disclosed native-calendar and touch limitations.
- These follow-up changes affect documentation only. Product code remains the reviewed implementation. Existing code/test/build evidence was reused; no additional independent review was requested or run.
- PR publication is authorized. Merge and deployment are not authorized.

