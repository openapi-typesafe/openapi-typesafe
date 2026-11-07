# openapi-typesafe

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/openapi-typesafe/openapi-typesafe/badge)](https://scorecard.dev/viewer/?uri=github.com/openapi-typesafe/openapi-typesafe)

Type-safe TypeScript for OpenAPI: generate types from an OpenAPI 3.x schema and call your API with a
fully typed `fetch` client.

`openapi-typesafe` is a maintained, drop-in successor to
[`openapi-typescript`](https://github.com/openapi-ts/openapi-typescript) and `openapi-fetch`, whose
author [stopped maintaining them](https://github.com/openapi-ts/openapi-typescript/issues/2874) in
September 2026. It is a fork with the full upstream history (see [NOTICE](./NOTICE)).

> **Status: release candidate.** `1.0.0-rc` releases are on npm under the `next` tag
> (`npm install -D openapi-typesafe@next`). The goals below describe the 1.0 release. Progress is
> tracked in [ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md).

## Goals for 1.0

- **Drop-in.** Migrate by changing package names. Generated output and the client API stay compatible.
- **TypeScript 7 ready.** The generator will not depend on the TypeScript compiler API, so it works the
  same on TypeScript 5, 6 and 7.
- **Verifiably compatible.** Every release ships a public compatibility report against more than
  1,800 real-world OpenAPI 3.x schemas.
- **Secure releases.** Minimal dependencies, npm provenance, no long-lived publish tokens.

## Packages

| Package | Replaces | Purpose |
|---|---|---|
| [`openapi-typesafe`](./packages/openapi-typesafe) | `openapi-typescript` | CLI and Node API: OpenAPI 3.0 / 3.1 → TypeScript types |
| [`openapi-typesafe-fetch`](./packages/openapi-typesafe-fetch) | `openapi-fetch` | Type-safe `fetch` client for the generated types |
| [`openapi-typesafe-helpers`](./packages/openapi-typesafe-helpers) | `openapi-typescript-helpers` | Shared type helpers |
| [`openapi-typesafe-react-query`](./packages/openapi-typesafe-react-query) | `openapi-react-query` | TanStack Query bindings |
| [`openapi-typesafe-migrate`](./packages/openapi-typesafe-migrate) | — | Moves a project to the packages above |

All packages share one version (ADR-016).

## Usage

```sh
npx openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts
```

```ts
import createClient from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

const client = createClient<paths>({ baseUrl: "https://api.example.com/v1/" });

const { data, error } = await client.GET("/posts/{post_id}", {
  params: { path: { post_id: "123" } },
});
```

Both the request and the response are checked against the schema. There are no manual type annotations.

## For coding agents

- **Agent skill:** [`skills/openapi-typesafe`](./skills/openapi-typesafe/SKILL.md) teaches an agent the
  setup, typed calls, error handling, middleware, TanStack Query hooks and the migration from openapi-typescript.
  It follows the [Agent Skills](https://agentskills.io) format: copy the directory to `.claude/skills/` in your
  project for Claude Code, or to wherever your agent loads skills. [`tools/skill-evals`](./tools/skill-evals)
  measures it on 34 coding tasks.
- **`llms.txt`:** the docs site serves `llms.txt` (an index of every page), `llms-full.txt` (all pages in one
  file) and a Markdown copy of each page.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Project rules are in [GOVERNANCE.md](./GOVERNANCE.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). Report vulnerabilities as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE). The original copyright notices of `openapi-typescript` and `openapi-react-query`
are preserved. This project is not affiliated with or endorsed by the original authors.
