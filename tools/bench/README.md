# Benchmarks

Measures what [docs/benchmarks.md](../../docs/benchmarks.md) reports: how fast the openapi-typesafe
CLI generates types compared with the published `openapi-typescript@7.13.0`, and how large the
clients are compared with `openapi-fetch` and `openapi-react-query`. Nothing here is a CI gate; the
numbers depend on the machine.

## Generator speed

Each generator runs end to end through its CLI (`node <cli> <document> -o <file>`) in a fresh Node
process, as a user runs it, so the time includes start-up, loading and parsing the document,
printing and writing the file. The two generators take turns within each round. Per document and
generator: one warm-up run (dropped), then five measured runs; the report gives the median wall
time and the median peak resident memory (RSS). A preloaded probe (`src/adapters/peak-rss-probe.cjs`)
reads the peak RSS inside each process (`process.resourceUsage().maxRSS`), so it means the same
on every operating system.

The documents come from the compatibility corpus, and the baseline is the published 7.13.0 that
the compatibility harness installs (with TypeScript 5.9.3, its supported peer). Once, with
network access:

```sh
pnpm build                                        # at the repository root
cd tools/compat-harness
pnpm harness fetch --corpus all                   # the corpus (Microsoft Graph beta is not in the subset)
scripts/prepare-generators.sh                     # installs openapi-typescript@7.13.0
```

Then, without network access, from `tools/bench`:

```sh
pnpm bench > report.md                            # progress on stderr, Markdown table on stdout
pnpm bench --runs 9 --warmups 2                   # more runs
pnpm bench --baseline-cli <path/to/bin/cli.js>    # another baseline
```

| Option                  | Default                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `--runs <n>`            | `5` measured runs per document and generator                  |
| `--warmups <n>`         | `1` warm-up run, not measured                                 |
| `--documents-dir <dir>` | `../compat-harness/.cache/compat/documents`                   |
| `--candidate-cli <cli>` | `../../packages/openapi-typesafe/bin/cli.js` (build it first) |
| `--baseline-cli <cli>`  | the `upstream-7.13.0` generator of `prepare-generators.sh`    |

Run it on a quiet machine: other processes change wall times more than any difference measured
here. Exit codes: `0` done, `1` a generator failed or a document is missing, `2` invalid
arguments.

## Client size

```sh
pnpm build                                        # at the repository root
pnpm --filter @openapi-typesafe/bench compare-size
```

This runs [size-limit](https://github.com/ai/size-limit) with the same settings as the bundle
budget in the root `package.json` (bundled with all dependencies and minified; once without and
once with gzip). The React Query bindings leave out `@tanstack/react-query`, `react` and the fetch
client, which an app installs anyway.

## Client run time

The overhead of a request through the fetch client, with a stubbed `fetch`, is measured by the
bench of `packages/openapi-typesafe-fetch` (it includes `openapi-fetch` 0.17.0):

```sh
pnpm --filter openapi-typesafe-fetch exec vitest bench --run --reporter=verbose
```
