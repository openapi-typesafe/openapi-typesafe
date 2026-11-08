# ADR-029: A time limit on every CI job

- Status: Accepted, amended by ADR-038 (the full compatibility run) and ADR-039 (docs external links)
- Date: 2026-11-05

## Context

No job had `timeout-minutes` except the full compatibility run (240). GitHub then stops a job only
after 360 minutes. On 2026-11-05 the `client e2e (browsers)` job of PR #13 hung for 42 minutes in
`playwright install --with-deps`, because the Ubuntu package mirror answered very slowly; it
usually takes 1.4 minutes. Nothing failed, so the pull request waited until the run was cancelled
by hand. CODING_PRINCIPLES §8.6 asks for clear, justified time limits.

Measured on the successful runs of 2026-11-02 to 2026-11-05 (up to 15 runs per workflow):

| Job | Median | Slowest |
|---|---|---|
| test (node 22, 24, 26), coverage gate | 2.4–3.1 min | 3.5 min |
| test (windows-latest) | 3.7 min | 4.6 min |
| test (macos-15-intel) | 7.0 min | 9.0 min |
| client e2e (browsers) | 1.4 min | 54 min (one run with the slow mirror) |
| compatibility (subset) | 5.2 min | 5.5 min |
| release publish | 4.4 min | 4.4 min |
| every other job | under 2 min | 2.3 min |

## Decision

Every job has `timeout-minutes`: about three times its slowest normal run, rounded up to 10, 15,
20 or 30 minutes, and at least 10. Above 30 minutes, the limit is rounded up to a multiple of 30
(ADR-038).

| Limit | Jobs |
|---|---|
| 10 | conventional commits, lint, types, runtimes, bundle size, docs, docs external links (ADR-039), skill eval tasks, docs build, release version, dependency review, scorecard |
| 15 | test (node), coverage gate, deploy to pages |
| 20 | client e2e, compatibility subset, release publish, publish dry run |
| 30 | test (macos-15-intel, windows-latest) |
| 15, 60, 270 | compatibility full: report, real projects, each of the 16 shards (ADR-038; was one job with 240) |

The 54-minute e2e run is not a normal run: a job that slow is better failed and re-run than
waited for. The publish limit does not include the wait for approval, which happens before the job
starts.

## Alternatives

- **No limits** (before): a hung job holds a pull request for up to 6 hours and spends runner
  minutes.
- **One limit for every job** (for example 30): simple, but a hung 1-minute job still waits 30.
- **A retry around `playwright install`**: fixes only this one step; other steps can hang too.

## Consequences

- A slow but healthy run can now fail on time. That is a signal to re-run it, or to raise the limit
  here with new measurements.
- A new job needs a limit too, chosen by the same rule.

## Review trigger

A job fails on its limit twice in a month without a hang, or the runner hardware changes.
