# Phase 5 exit gate (transformer migration)

> ENGINEERING_PLAN Phase 5 exit gate: all transformers produce IR and output is printed by our
> printer; on every spec the original handles: 100% type identity and ≥ 99% byte identity. Checked on
> 2026-11-02 at commit `5a4bf3eb`. Logs: `.logs/phase5/` (not in git).

## Results

| Check | Cases | Result |
|---|---|---|
| Compatibility matrix after each step (200-entry subset × 23 option sets) | 4,600 per step | 0 mismatches after every step (1–7); byte identity 100%, type identity 100% |
| Full corpus, default options (`--corpus all`) | 1,820 | 0 mismatches; byte identity 100%, type identity 100% |
| Parity property tests (ported code vs fork-base code), per transformer | 20,000 runs each | No counterexample |
| Print path parity (our printer vs TypeScript printer, same run) | 20,000 runs | No counterexample |

Full-corpus generation failures, not counted as mismatches:

| Entry | fork-base | current | Reason |
|---|---|---|---|
| `apis-guru--cpy.re_peertube--5.1.0` | failed | failed | `$ref` to a URL that answers 400 |
| `apis-guru--digitalocean.com--2.0` | failed | failed | `$ref` to a relative file not in the corpus |
| `apis-guru--spotify.com--1.0.0` | failed | failed | `$ref` to a relative file not in the corpus |
| `curated--oai-examples_3.2-query-example--v3.2` | failed | ok | The fork base rejects OpenAPI 3.2 (supported since ADR-006) |
| `curated--oai-examples_3.2-tags-example--v3.2` | failed | ok | Same |
| `curated--train-travel--1.3.0` | failed | ok | Same |

## Remaining byte differences

None on the corpus. Known differences outside it, each with a reason:

- A multi-line template literal type returned by a `ts.Node` callback is re-indented line by line
  (ADR-004, consequences).
- A `$defs` root type that a callback returns as a type literal the IR keeps as raw text becomes
  `Record<string, never>` (ADR-004, consequences).
- Fork-base bugs kept on purpose are listed in [legacy-bugs.md](./legacy-bugs.md); the module-level
  `enumCache` (item 3) no longer affects the generator.

## State left for Phase 6

- The Node API (`openapiTS()`) still returns `ts.Node[]`; the CLI prints IR (ADR-010).
- The footer is still the public `ctx.injectFooter: ts.Node[]` list, with IR kept by the footer sink.
- `lib/ts.ts`, the transform context adapter and the IR → `ts.Node` direction of the bridge remain.
