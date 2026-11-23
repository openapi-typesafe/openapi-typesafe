---
title: Benchmarks
description: Generation speed, memory and client size of openapi-typesafe compared with openapi-typescript 7.13 and openapi-fetch 0.17.
---

# Benchmarks

How openapi-typesafe compares with the packages it replaces: the published
`openapi-typescript@7.13.0`, `openapi-fetch@0.17.0` and `openapi-react-query@0.5.4`. Where
openapi-typesafe is slower or larger, the table says so. Every number here comes from
[`tools/bench`](https://github.com/openapi-typesafe/openapi-typesafe/tree/main/tools/bench), which
you can run yourself; timings depend on the machine, so compare the columns, not the absolute
values with your own.

## Generator speed

Measured on 2026-11-23 with openapi-typesafe 1.0.0-rc.16.

Machine: Apple M5, 26 GB RAM, Darwin 27.2.0, Node.js 26.0.0.
Median of 7 runs after 1 warm-up run(s); default options; peak RSS is the median of the per-run peaks.

| Document | Input | openapi-typesafe 1.0.0-rc.16: time | openapi-typescript 7.13.0: time | Time difference | openapi-typesafe 1.0.0-rc.16: peak RSS | openapi-typescript 7.13.0: peak RSS |
|---|---|---|---|---|---|---|
| Petstore (expanded) | 5 KB | 164 ms | 242 ms | 32% faster | 90.9 MB | 149.9 MB |
| OpenAI (YAML) | 4.3 MB | 853 ms | 811 ms | 5% slower | 276.5 MB | 317.2 MB |
| Stripe | 8.3 MB | 897 ms | 878 ms | 2% slower | 362.4 MB | 374.1 MB |
| GitHub REST | 13.9 MB | 1.4 s | 1.3 s | 9% slower | 524.1 MB | 509.8 MB |
| Cloudflare | 27.6 MB | 2.9 s | 2.6 s | 11% slower | 1020.4 MB | 908.9 MB |
| Microsoft Graph beta | 74.1 MB | 12.5 s | 9.8 s | 27% slower | 2071.1 MB | 2301.8 MB |

Each run is the whole CLI in a fresh Node.js process (`openapi-typesafe <document> -o <file>`,
default options), as a user or a CI job runs it: start-up, loading and bundling the document with
Redocly, building the types, printing and writing the file. The two generators take turns within
each round, so a busy phase of the machine slows both alike. openapi-typescript 7.13.0 runs with
TypeScript 5.9.3, its supported peer.

What the table shows:

- **Small documents: openapi-typesafe is faster** (Petstore: 164 ms against 242 ms) and uses less
  memory, because it does not load the TypeScript compiler. A CI job that generates types from a
  few small documents gets the start-up difference on every run.
- **Large documents: openapi-typesafe is slower**, by 2% (Stripe) to 27% (Microsoft Graph beta,
  12.5 s against 9.8 s). Its printer is about twice as fast as the TypeScript printer that
  openapi-typescript uses (measured on the same documents in
  [the printer study](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/internal/research/printer-performance.md)),
  so the extra time is spent before printing, in building the types. That part also does more
  work than 7.13 did (the [output fixes](./migration-guide.md#output-fixes), such as enums that
  are kept apart); which part costs the time is not profiled yet.
- **Memory:** openapi-typesafe needs less on four of the six documents, 3% more on GitHub REST and
  12% more on Cloudflare (1.02 GB against 0.91 GB).

The machine was shared with other work while this ran (load average 9 to 19 on 10 cores).
Because the two generators take turns, the load slows both alike, but the absolute times are
higher than on a quiet machine, and differences of a few percent are within the noise.

## Client size

| Package | Minified | Minified + gzip |
| --- | ---: | ---: |
| `openapi-typesafe-fetch` (rc.16) | 11.88 kB | 4.49 kB |
| `openapi-fetch` 0.17.0 | 7.36 kB | 2.82 kB |
| `openapi-typesafe-react-query` (rc.16) | 8.71 kB | 3.33 kB |
| `openapi-react-query` 0.5.4 | 1.02 kB | 0.50 kB |

Measured with [size-limit](https://github.com/ai/size-limit) and the settings of the bundle budget
that CI enforces: the package bundled with all its dependencies (it has none) and minified. The
React Query bindings leave out `@tanstack/react-query`, `react` and the fetch client.

Both packages are larger than the ones they replace, and the difference is code that fixes
behavior, not new features you have to opt into:

- **openapi-typesafe-fetch** (+4.5 kB minified, +1.7 kB gzipped): request bodies told apart by
  their type, header parameters in the OpenAPI `simple` style, nested values serialized instead of
  sent as `[object Object]`, an empty body handled by `parseAs`, the query placed before a URL
  fragment, an `Error` from another realm reported in `onError`, and more. Each fix and its size
  cost is recorded in [ADR-013](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/013-client-behavior-fixes.md),
  [ADR-030](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/030-client-fixes-from-rc1-acceptance.md) and
  [ADR-041](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/041-parameter-values-and-json-parse-errors.md), and listed under
  [Client fixes](./migration-guide.md#client-fixes).
- **openapi-typesafe-react-query** (+7.7 kB minified, +2.8 kB gzipped): openapi-react-query puts
  the request init into the query key as it is, so two different requests could share one cache
  entry (a `Headers` object hashes as `{}`, a function as nothing, two clients with different
  `baseUrl`s get the same keys), and `useQuery` ignored TanStack Query's abort signal. The keys
  now describe the request that is sent, and the signals are merged
  ([ADR-046](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/adr/046-query-keys-name-the-request.md) and its amendments).

The budgets in the root `package.json` fail CI when a bundle grows past them.

## Client run time

The overhead of one request through the client, with `fetch` replaced by a stub that answers at
once, so no network time is included (`vitest bench`, operations per second, higher is better):

| Benchmark | `openapi-typesafe-fetch` | `openapi-fetch` 0.17.0 |
| --- | ---: | ---: |
| Create a client | 7,981,000 ops/s | 7,797,000 ops/s |
| `GET` with a URL only | 209,000 ops/s | 212,000 ops/s |
| `GET` with headers | 133,000 ops/s | 156,000 ops/s |

Measured on the same machine and day (Node.js 26.0.0). Creating a client and a plain `GET` cost the
same. A `GET` with headers was about 15% slower in this run, which is close to the run-to-run
spread of these benchmarks (±10 to 15%); its cause is not profiled. One call takes 5 to 8
microseconds either way, far below the time of any real network request. The bench also includes other clients (`openapi-typescript-fetch`,
`axios`, `feature-fetch`).

## Run it yourself

The [`tools/bench` README](https://github.com/openapi-typesafe/openapi-typesafe/tree/main/tools/bench)
has the commands. In short: build the packages, download the corpus and the baseline once with the
compatibility harness, then `pnpm bench` runs without network access and prints the table above.
