# ADR-038: The full compatibility run is split into 16 shard jobs

- Status: Accepted
- Date: 2026-11-07

## Context

The full compatibility run (`compat` workflow, on demand and nightly once the repository is
public) generates the whole corpus (1,820 documents) with the whole option matrix (28 option
sets) three times, plus the opt-in option sets once, then compares and checks the outputs. It was
one job with a limit of 240 minutes (ADR-029).

Run 42381789068 on 2026-11-07, on the runner of the private repository, hit that limit: setup took
2 minutes, the real-project check 14 minutes, and the first `generate` (fork-base) finished 46,548
of its 50,960 cases in the remaining 225 minutes. Once the repository is public, every nightly run
would fail the same way.

Estimate of the whole run on that runner. The fork-base label takes about 246 minutes (the
225-minute share scaled to every case). The other steps are scaled from local runs (M-series Mac,
4 workers) by the sum of the per-case durations of each label, or by the wall time of a label
when the step has no per-case durations:

| Step | Local | CI estimate |
|---|---|---|
| generate fork-base | 455 min of case time | 246 min (measured share) |
| generate upstream-7.13.0 | about the same generator as fork-base | 246 min |
| generate current | 300 min of case time, 48–58 min wall | 162 min |
| generate current-opt-in | 92 min of case time, 39 min wall | 50 min |
| compare `--types`, twice | 13–15 min wall each | 90 min |
| check-opt-in | 5 min wall | 16 min |
| total | | about 810 min |

## Decision

1. **16 shard jobs.** Each job generates and compares every 16th entry of the selected corpus
   (`generate --shard <index>/<count>`): shard `i` takes entries `i - 1`, `i - 1 + 16`, and so on.
   Every n-th entry instead of a block spreads the many versions of one large API over the
   shards. With the per-entry times of the local run, the slowest shard takes 1.33 times the
   average: about 810 / 16 × 1.33 ≈ 68 minutes, plus 3 minutes of setup.
2. **Shard results are merged by the harness.** `generate` writes `results/shard.json` with its
   shard. Each shard job uploads its `results` directory (JSON only, no generated files). The report
   job downloads them and runs `harness merge --shards <dir>`, which checks that the directories are
   shards 1 to N of one split, each with the same result files and case counts that fit the split,
   and writes the merged files in the order of an unsharded run. `harness gate` then applies the
   release gate of `compare` and `check-opt-in` to the stored results, and `harness report` renders
   the reports unchanged. `scripts/merge-compat.sh` runs these three steps;
   `scripts/run-compat.sh <corpus> <option-sets> <shard>` runs one shard without the reports.
3. **The real-project check is its own job,** in parallel with the shards. The report job downloads
   its `dependents.json`, so the report keeps its "Real projects" section.
4. **The report job runs after every shard and the project check, also when one of them failed,**
   and uploads the `compat-all` artifact with the same paths as before (RELEASING.md, step 6). A
   shard with a mismatch is red too, so the failing slice is visible. Shard and project logs are in
   their own artifacts (`compat-shard-<i>-logs`, `compat-dependents-logs`).
5. **Time limits by the rule of ADR-029** (about three times the slowest normal run; above 30
   minutes, rounded up to a multiple of 30):

   | Job | Slowest normal run | Limit |
   |---|---|---|
   | compatibility (full, shard i) | about 70 min (estimate above) | 210 |
   | compatibility (full, real projects) | 15 min (measured, setup included) | 60 |
   | compatibility (full, report) | a few minutes (16 downloads, about 60 MB of JSON) | 15 |

   The per-PR subset job does not change: about 6 minutes, limit 20.

`run-compat.sh` without a shard works as before, for the local run before a release.

## Alternatives

- **Raise the limit of the one job.** The run takes about 810 minutes on this runner, and GitHub
  stops any job after 360 minutes.
- **Fewer shards.** With 12, the slowest shard takes about 84 minutes and its limit would exceed
  the old 240. With 8, about 140 minutes, too close to 360 with the 3x rule.
- **More shards.** GitHub Free runs at most 20 jobs of an account at once. 16 shards and the project
  check use 17, so other workflows still start. With 24 or 32 shards the jobs queue, and each job
  adds about 3 minutes of setup (checkout, install, build, golden generators).
- **Shards by hash of the entry id.** Stable when the corpus changes, but the shard sizes then vary
  by chance; every n-th entry gives sizes that differ by at most one, which `merge` also checks.
- **Merge with shell glue (`jq`).** The harness already decodes and validates every result file; a
  merge in the harness has unit tests and the same error codes as the other commands.
- **Shard by option set.** 28 option sets do not divide evenly, and one large document then runs in
  every shard of its label.

## Consequences

- A full run uses about the same runner minutes as before, plus about 50 minutes of setup in the
  shards, and its wall time is about 75 minutes instead of more than 13 hours.
- 16 jobs fetch the corpus. The cache key is the same for all of them, so the first one that saves
  it saves the whole corpus.
- The report job's logs in `compat-all` are only those of the merge, gate and report commands.
- The shard count is the length of the matrix list in `compat.yml`; the jobs read it from
  `strategy.job-total`, so it is written once.

## Review trigger

The first full runs on the runner of the public repository (4 CPUs instead of 2): measure the
slowest shard and lower the limit by the rule of ADR-029. Also when a shard fails on its limit
without a hang, or the corpus or option matrix grows by more than a quarter.

## Amendment (2026-11-08): limits from the first measured run

The first full run on the public repository's runner (run 42485839061) passed: 50,960 cases, 0
mismatches, 22 of 22 projects. Its times differ from the estimate: the shards took 40 to 88 minutes
(median about 57), not about 70 at most, and the run took 1 hour 43 minutes of wall time. The spread
comes from the corpus, where a few very large documents land in some shards.

By the rule of ADR-029, the shard limit is 270 minutes (3 x 88 = 264, rounded up to a multiple of
30), not 210, which was only 2.4 times the slowest shard. It stays below GitHub's 360. The real
projects job took 14 minutes, so its limit of 60 stays.

Review trigger: a shard slower than 120 minutes, which would bring 3x above 360; then split into
more shards or balance them by document size.

