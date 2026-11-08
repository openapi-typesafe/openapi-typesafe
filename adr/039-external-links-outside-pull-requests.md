# ADR-039: External links of the docs site are checked outside pull requests

- Status: Accepted
- Date: 2026-11-08

## Context

The `docs (build, links)` job of `ci.yml` ran `check-links` on every pull request: the repository
link script, then linkinator 8.1.0 on the built site with `retry: true`, `retryErrors: true`,
`retryErrorsCount: 3`, `timeout: 20000` and `concurrency: 20`. Linkinator requested every external
link of the site.

On 2026-11-07 the job of PR #24 (job 128504737596) hit its 10-minute limit (ADR-029). The log shows
linkinator checking many `https://github.com/<user>` links, then nothing for about 10 minutes until
the job was cancelled. The pull request changed no docs.

Why it can hang. With `retry: true`, linkinator 8.1.0 answers an HTTP 429 that has a `Retry-After`
header by waiting that long and asking again. It has no upper bound on the wait and no limit on
the number of such retries: the README calls the `RetryConfig` object "a placeholder for
fine-grained controls to be implemented at a later time", and `--help` lists no such option.
GitHub sends 429 with a long `Retry-After` when one client asks for many pages at once.

What the site links to (built with `DOCS_SITE_URL=http://localhost/`, 2026-11-08):

| Links | Unique URLs |
|---|---|
| GitHub profiles of the contributors on the About page (`docs/data/contributors.json`) | 172 |
| Their avatars (`avatars.githubusercontent.com`) | 170 |
| Every other external link | 133 |

So more than two thirds of the external requests went to GitHub, 20 at a time, for a list of
names that comes from a static file.

## Decision

1. **Pull requests check only the site itself.** `check-links` (CI `docs` job) skips every URL that
   is not on linkinator's local server (`^(?!http://127\.0\.0\.1:\d+/)`). It checks every page,
   asset and anchor of the built site, and `scripts/check-repository-links.mjs` still checks every
   link into this repository against the working tree. It requests no other site, so its result
   depends only on the pull request. Its `timeout` is 10 seconds: the local server answers in
   milliseconds, and the limit only stops a stuck server. It needs no retries.
2. **External links are checked by the `docs links` workflow** (`.github/workflows/docs-links.yml`,
   script `check-external-links`, config `docs/linkinator.external.config.json`):
   - after every push to main that changes `docs/`, so a new bad link shows up right after its
     merge;
   - every Monday at 05:23 UTC, for links that broke on their own; once a week is soon enough for
     docs, and costs about 1.5 runner minutes a week while the repository is private;
   - on demand (`workflow_dispatch`).

   A broken link fails the run. A failed run is red in the Actions tab and GitHub notifies the user
   who started it.
3. **No unbounded wait.** The external config sets `retry: false`, so linkinator never waits for
   `Retry-After`. A 429, a 5xx or a network error is retried by `retryErrors` instead, with
   `retryErrorsCount: 3` and the default `retryErrorsJitter: 3000`: waits of 2, 4 and 8 seconds plus
   up to 3 seconds each. With `timeout: 20000` the worst case for one link is 4 requests of 20
   seconds plus 23 seconds of waits, about 1.7 minutes. A link that still fails is reported as
   broken.
4. **10 requests at a time** (`concurrency: 10`, was 20). It halves the burst on one host. The
   measured run of 133 URLs takes 12 seconds, so the lower value costs little.
5. **Contributor profiles and avatars are not requested.** The external config skips
   `^https://github\.com/[^/]+/?$` (a user or organization page) and
   `^https://avatars\.githubusercontent\.com/`. The list is copied from upstream with the git
   history; a renamed account is not a docs error that needs action, and these 342 URLs are most of
   the load that triggers GitHub's 429. Links to repositories, files and issues on GitHub are still
   checked.
6. **Time limit.** The `docs (external links)` job has `timeout-minutes: 10` by the rule of ADR-029
   (about 1.5 minutes with setup, three times that, at least 10). If every request hangs, the
   bounds above add up to about 24 minutes (14 rounds of 10 links at 1.7 minutes), so the job limit
   is what stops that case, and the run fails instead of waiting.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Internal links on pull requests, external links on main, weekly and on demand (chosen) | A pull request is red only for its own change; no wait on other sites; external breakage still fails loudly | A broken external link is found after the merge, not before |
| Keep external links on pull requests, with a bound on every wait | Finds a bad new link before the merge | Another site's rate limit or outage still turns unrelated pull requests red; linkinator 8.1.0 cannot bound the `Retry-After` wait, so `retry` must be off anyway |
| Keep `retry: true` and lower the concurrency only | Small change | The wait is still unbounded; one long `Retry-After` hangs the job again |
| Nightly instead of weekly | Finds rot sooner | Seven times the runner minutes for links that rarely break; docs changes are already checked on push |
| Check contributor profiles at low concurrency | Finds renamed accounts | 342 more requests to GitHub per run for no reader-facing benefit |

## Consequences

- The PR check takes about 1 second for linkinator instead of minutes, and gives the same answer on
  every run.
- A bad external link added in a pull request is found by the push run on main. The fix is a
  follow-up pull request.
- A renamed contributor account is not found. The About page still shows the name.
- Running `pnpm --filter openapi-typesafe-docs check-external-links` locally before a docs pull
  request is a good habit, not a gate.

## Review trigger

Linkinator gets a bound on the `Retry-After` wait; the `docs links` workflow fails twice in a month
on rate limits or timeouts rather than on broken links; or a broken external link reaches the
published site and stays there for more than a week.
