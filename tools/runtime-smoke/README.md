# Runtime smoke tests

Checks that the published packages load and work as an ESM consumer (`smoke/esm.mjs`) and as a CommonJS consumer
(`smoke/cjs.cjs`) on every supported runtime (ENGINEERING_PLAN 8.2): Node.js 22, 24 and 26, Bun and Deno. Each
script generates types for a small document through the Node API of `openapi-typesafe` and makes a request with
`openapi-typesafe-fetch` against an in-memory `fetch`. The scripts are plain JavaScript so every runtime runs them
unchanged.

```sh
pnpm build                     # at the repository root first
pnpm smoke:node                # or smoke:bun, smoke:deno
```

Each script prints one `ok <format> <check>` line per check and exits 1 on the first failure. CI runs every runtime
in the `runtimes` job; last local run: Node.js 26.0.0, Bun 1.4.4, Deno 2.9.6, all checks passed, no warnings.
