<p align="center">
  <img src="docs/public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">openapi-typesafe</h1>

<p align="center">
  TypeScript types from OpenAPI 3.0, 3.1 and 3.2, and a typed <code>fetch</code> client.<br>
  The maintained, drop-in successor to openapi-typescript and openapi-fetch.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/openapi-typesafe"><img alt="npm" src="https://img.shields.io/npm/v/openapi-typesafe/next?label=npm%40next"></a>
  <a href="https://github.com/openapi-typesafe/openapi-typesafe/actions/workflows/ci.yml?query=branch%3Amain"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/openapi-typesafe/openapi-typesafe/ci.yml?branch=main&label=CI"></a>
  <a href="https://github.com/openapi-typesafe/openapi-typesafe/actions/workflows/compat.yml?query=event%3Aschedule"><img alt="Nightly compatibility" src="https://img.shields.io/github/actions/workflow/status/openapi-typesafe/openapi-typesafe/compat.yml?event=schedule&label=nightly%20compatibility"></a>
  <a href="./tools/type-matrix"><img alt="TypeScript 5.4 | 6 | 7" src="https://img.shields.io/badge/TypeScript-5.4%20%7C%206%20%7C%207-3178c6"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/openapi-typesafe/openapi-typesafe"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/openapi-typesafe/openapi-typesafe/badge"></a>
  <a href="https://www.bestpractices.dev/projects/16469"><img alt="OpenSSF Best Practices" src="https://www.bestpractices.dev/projects/16469/badge"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/openapi-typesafe/openapi-typesafe"></a>
</p>

<p align="center">
  <a href="https://openapi-typesafe.github.io/openapi-typesafe/">Docs</a> ·
  <a href="https://openapi-typesafe.github.io/openapi-typesafe/migration-guide">Migration guide</a> ·
  <a href="./docs/compatibility.md">Compatibility report</a> ·
  <a href="./docs/benchmarks.md">Benchmarks</a>
</p>

The author of [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) and
openapi-fetch [stopped maintaining them](https://github.com/openapi-ts/openapi-typescript/issues/2874)
in September 2026. openapi-typesafe is a fork with the full upstream history (see [NOTICE](./NOTICE)):
the same CLI flags, Node API, generated types and client API, kept working and fixed.

> **Release candidate.** The current version is `1.0.0-rc.N`; names and output can still change
> before 1.0.0. [Versioning](./docs/compatibility.md#versioning) lists what 1.x will promise.

## Why openapi-typesafe

|  | openapi-typesafe | openapi-typescript 7.13 + openapi-fetch 0.17 |
|---|---|---|
| Maintained | Yes | No: last release on 2026-02-11 (7.13.0, 0.17.0) |
| TypeScript 7 | Works with TypeScript 5.4, 6 and 7: the generator prints types itself ([why](https://openapi-typesafe.github.io/openapi-typesafe/typescript-7)) | Needs the TypeScript 5 compiler API; does not run next to TypeScript 7 |
| OpenAPI 3.2 | Types for `query` operations, `in: querystring`, `itemSchema` and more ([list](https://openapi-typesafe.github.io/openapi-typesafe/introduction#openapi-3-2-support)) | Rejects 3.2 documents |
| Same output, proven | Compared with 7.13 on 1,820 real schemas every night ([report](./docs/compatibility.md)) | — |
| Fixes | Output that did not compile or had wrong types, client bugs ([list](https://openapi-typesafe.github.io/openapi-typesafe/migration-guide#what-is-different)) | None after 2026-02-11 |
| Migration | One command: `npx openapi-typesafe-migrate` | — |
| Releases | npm provenance, trusted publishing (no npm token), CycloneDX SBOM per release ([RELEASING.md](./RELEASING.md)) | npm provenance |

## Is this the right tool?

openapi-typesafe generates **TypeScript types** (plus plain enums with `--enum`), and the client
is a thin typed wrapper around `fetch`: you call paths (`client.GET("/posts/{post_id}")`), not
generated functions. If you want a generated SDK with one function per operation, runtime
validators or mocks, look at a full SDK generator such as [Hey API](https://heyapi.dev) or
[Orval](https://orval.dev).

## By the numbers

| Area | Result |
|---|---|
| **Compatibility** | 1,820 real-world schemas × 28 option sets = 50,960 cases, **0** unexpected differences. Where the output of openapi-typescript 7.13 compiles and keeps its enums apart (49,114 cases), **99.88%** are byte-identical and **100%** type-identical. CI runs the full corpus every night. [Report](./docs/compatibility.md) |
| **Real projects** | 22 open-source projects switched by package name only: 19 pass every step they passed before, 3 stop at a breaking change the migration guide lists. [Details](./docs/compatibility.md#real-projects) |
| **Generator speed** | Preliminary, measured on a busy machine: faster than openapi-typescript 7.13 on small documents (no TypeScript compiler to load), slower on the largest ones (Microsoft Graph beta, 74 MB). Differences of a few percent are noise. [Benchmarks](./docs/benchmarks.md) |
| **Client size** | Larger than the originals, because of behavior fixes: `openapi-typesafe-fetch` 4.5 kB gzipped (openapi-fetch 0.17: 2.8 kB), `openapi-typesafe-react-query` 3.3 kB (openapi-react-query 0.5.4: 0.5 kB). [What the bytes buy](./docs/benchmarks.md#client-size) |
| **Type checks** | Every pull request type-checks the generated examples and the clients with TypeScript 5.4, 5.9, 6.0 and 7.0 ([type matrix](./tools/type-matrix)), and runs the packages on Node.js 22, 24 and 26, Bun and Deno. |
| **Tests** | CI fails below a coverage floor of 95–100% lines per package, and below 90% for each domain and application layer on its own ([`vitest.coverage.ts`](./vitest.coverage.ts)). |
| **Agent skill** | 34 of 34 coding tasks passed with the skill, 33 of 34 without it (one model, one run each, 2026-11-02). [Harness](./tools/skill-evals) |

## Quick start

```sh
npm install -D openapi-typesafe
npm install openapi-typesafe-fetch
npx openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts
```

```ts
import createClient from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

const client = createClient<paths>({ baseUrl: "https://api.example.com/v1/" });

const { data, error } = await client.GET("/posts/{post_id}", {
  params: { path: { post_id: "123" } },
});
// data: the 2xx response body, typed; error: the documented error body, typed.
```

The path, the parameters, the request body and both results are checked against the schema,
with no type annotations of your own. Node.js 22.12 or newer;
[setup](https://openapi-typesafe.github.io/openapi-typesafe/introduction#setup) covers the
`tsconfig` options.

## Migrate in one command

In the root of a project that uses openapi-typescript, openapi-fetch or openapi-react-query, with
a clean git tree:

```sh
npx openapi-typesafe-migrate          # report what would change
npx openapi-typesafe-migrate --write  # change the files
```

It renames the packages in manifests, catalogs and imports, the `openapi-typescript` command and
its renamed flags in scripts and CI files, and lists what it cannot change safely. Then install,
regenerate once and run your type check. The
[migration guide](https://openapi-typesafe.github.io/openapi-typesafe/migration-guide) lists every
difference.

## Packages

| Package | Replaces | Purpose |
|---|---|---|
| [`openapi-typesafe`](./packages/openapi-typesafe) | `openapi-typescript` | CLI and Node API: OpenAPI 3.0, 3.1 and 3.2 to TypeScript types |
| [`openapi-typesafe-fetch`](./packages/openapi-typesafe-fetch) | `openapi-fetch` | Typed `fetch` client for the generated types |
| [`openapi-typesafe-react-query`](./packages/openapi-typesafe-react-query) | `openapi-react-query` | TanStack Query v5 hooks on the client |
| [`openapi-typesafe-helpers`](./packages/openapi-typesafe-helpers) | `openapi-typescript-helpers` | Shared type helpers |
| [`openapi-typesafe-migrate`](./packages/openapi-typesafe-migrate) | — | Moves a project to the packages above |

All packages share one version ([ADR-016](./adr/016-one-version-line.md)).

## For coding agents

- **Agent skill:** [`skills/openapi-typesafe`](./skills/openapi-typesafe/SKILL.md) teaches an
  agent the setup, typed calls, error handling, middleware, TanStack Query hooks and the migration.
  It follows the [Agent Skills](https://agentskills.io) format: copy the directory to
  `.claude/skills/` for Claude Code, or to wherever your agent loads skills.
  [`tools/skill-evals`](./tools/skill-evals) measures it on 34 coding tasks.
- **`llms.txt`:** the docs site serves
  [`llms.txt`](https://openapi-typesafe.github.io/openapi-typesafe/llms.txt) (an index of every
  page), [`llms-full.txt`](https://openapi-typesafe.github.io/openapi-typesafe/llms-full.txt) (all
  pages in one file) and a Markdown copy of each page.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Project rules are in [GOVERNANCE.md](./GOVERNANCE.md)
and the [Code of Conduct](./CODE_OF_CONDUCT.md); decisions are recorded in [`adr/`](./adr).
Report vulnerabilities as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE). The original copyright notices of `openapi-typescript` and `openapi-react-query`
are preserved. This project is not affiliated with or endorsed by the original authors.
