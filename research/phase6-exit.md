# Phase 6 exit gate (public API compatibility)

> ENGINEERING_PLAN Phase 6 exit gate: the inherited Node API test suite passes against the new
> implementation; the generator runs without TypeScript installed (verified in a clean install with
> TypeScript 7 only). Checked on 2026-11-02 at commit `e8cfaa9c`. Logs: `.logs/phase6/` (not in git).

## Results

| Check | Cases | Result |
|---|---|---|
| Package test suite, including the inherited Node API, transformer and CLI tests | 602 tests | All pass |
| Compatibility matrix after each task (200-entry subset × 23 option sets) | 4,600 per task | 0 mismatches after 6.1–6.6; byte identity 100%, type identity 100% |
| Full corpus, default options (`--corpus all`, labels `fork-base-full` / `current-full`) | 1,820 | 0 mismatches; byte identity 100%, type identity 100% |
| Bridge with TypeScript 5.9 and `@typescript/typescript6` 6.0.2 (property tests) | 500 runs each | No counterexample |
| Coverage of the package | — | 97.4% lines, 95.3% branches |

Full-corpus generation failures are the same six (fork base) and three (current) entries as in
[phase5-exit.md](./phase5-exit.md): broken `$ref`s, and OpenAPI 3.2 that the fork base rejects.

## Clean install with TypeScript 7 only

A packed tarball installed next to `typescript@7.0.2` (no JavaScript compiler API: `factory` and
`createPrinter` are missing):

| Check | Result |
|---|---|
| `npx openapi-typesafe github-api.yaml` | Runs; output equals `examples/github-api.ts` after the header |
| Node API, ESM and CJS, with `irCallbacks: true` | Runs |
| Importing `QUESTION_TOKEN` | Works; the token is created on first use |
| Legacy `postTransform` | Fails with `TypeScriptNotFoundError`, which names `typescript` ≤ 6 and `@typescript/typescript6` |
| Legacy `transform` after installing `@typescript/typescript6@6.0.2` | Runs, with one deprecation warning |

## Intentional differences from the fork base

- The `inject` option is printed as written, without the blank lines around it (ADR-010,
  decision 4). The fork base reformatted it with the TypeScript printer and dropped its comments.
  `inject` is a Node API option only; the CLI corpus does not use it.
- `--path-params-as-types` escapes a backtick in a URL ([legacy-bugs.md](./legacy-bugs.md) #10).
  No corpus entry has one.
- Known differences from Phase 5 still apply (ADR-004, consequences).

## State left for Phase 7

- `lib/transform-context.ts` still adapts the public `GlobalContext` to the ported transformers'
  `TransformContext`. It holds no node conversion any more; task 7.3 moves it into the
  composition roots.
- `lib/redoc.ts` (81% lines) and `lib/utils.ts` (81% lines) are below the 90% target (task 7.5).
