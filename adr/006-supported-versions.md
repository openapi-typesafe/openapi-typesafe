# ADR-006: Supported TypeScript and Node versions, strict compiler flags rollout

- Status: Accepted
- Date: 2026-11-02

## Context

- Upstream never declared supported Node versions (`engines` was missing) and declared `typescript: ^5.x` as a peer,
  which blocks installation next to TypeScript 6 and 7 under strict peer resolution.
- Node 20 reached end of life on 2026-04-30. Node 22 is supported until 2027-04-30; Node 24 and 26 are current.
- A consumer type-check of generated output and the client (`strict`, `skipLibCheck: false`) passes on TypeScript
  5.4 through 5.9, 6.0 and 7.0, and fails on 5.0–5.3 with `TS2344` in the client and helpers declarations
  ([`research/typescript-matrix.md`](../research/typescript-matrix.md)).
- The inherited code does not compile under the strict flags the project requires (§5.2 of the plan).

## Decision

1. **Node:** `engines: { node: ">=22" }` for every package, except the generator:
   `">=22.12.0"`, because its CommonJS build loads ESM-only dependencies with `require()`, which
   Node.js supports without a flag from 22.12. CI tests Node 22, 24 and 26. Within 1.x the floor
   rises only in a minor release, for a line that reached its end of life (ADR-034).
2. **TypeScript for consumers:** generated output and the client support **TypeScript ≥ 5.4**, including 6.x and
   7.x. CI type-checks with 5.4, 5.9, 6.0 and 7.0 (task 8.1).
3. **TypeScript for the generator:** until Phase 6 the generator still needs the compiler API at runtime, so it keeps
   working only with TypeScript ≤ 6. After Phase 6 it needs no TypeScript at all; `typescript` becomes an optional
   peer used only by the legacy bridge (ADR-004).
4. **Development compiler:** TypeScript 6 (re-evaluated after Phase 6, roadmap R4, 2026-11-03; it was 5.9 before).
   Not 7: TypeScript 7 has no JavaScript compiler API, which `unbuild` declarations and the legacy bridge use.
5. **Strict flags rollout:** new layered directories (`domain/`, `application/`, `adapters/`, `cli/`, `api/`) compile
   with full strictness (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
   `verbatimModuleSyntax`) from their first commit. Legacy files keep the inherited config and move to the strict
   config as they are ported. `openapi-typesafe-helpers` and `openapi-typesafe-react-query` switch in one step.
   `openapi-typesafe-fetch` runtime code is JavaScript (ADR-008); its hand-written declarations are checked under the
   strict flags by the consumer matrix.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| TS ≥ 5.4, Node ≥ 22 (chosen) | Matches measured reality; covers every maintained Node line | Users on TS ≤ 5.3 with `skipLibCheck: false` must upgrade or skip lib checks |
| TS ≥ 5.0 | Wider nominal support | Would require changing the client's public types, a risk to compatibility; 5.0–5.3 are over two years old |
| Node ≥ 20 | Wider support | Node 20 is end of life; testing it costs CI time with no security support upstream |
| Strict flags everywhere at once | One clean switch | One huge diff over code that is about to be rewritten anyway |

## Consequences

- Upgrading from upstream is safe for users on TypeScript ≥ 5.4 and Node ≥ 22.
- Users on TypeScript 5.0–5.3 keep working with `skipLibCheck: true` (the common default), but this is not supported.

## Review trigger

Node 22 end of life (2027-04-30): raise the floor to 24. A TypeScript release that breaks the consumer matrix. A
build tool that no longer needs the JavaScript compiler API (backlog item 31): move the development compiler to 7.

## Amendment (2026-11-08): the `typescript` peer range is the supported range

The public API audit before 1.0 (finding P3-3) noted that the generator's optional peer said
`typescript: ">=5.0.0"`, while decision 2 and the docs support 5.4 and newer. The pre-beta test
plan (3.7) had kept `>=5.0.0` because the legacy callbacks (ADR-004) ran with TypeScript 5.0.4.

1. **The peer range is `>=5.4.0`.** A peer range is what package managers read as support: it
   should say what we test and document, not what happened to run once. CI installs 5.4 as the
   lowest TypeScript (`test/declarations-typescript-versions.test.ts`, the type matrix), and
   5.0 to 5.3 fail on the client declarations (decision 2). No upper bound: TypeScript 7 is
   supported, and the legacy callbacks then load `@typescript/typescript6` (ADR-032).
2. **A test keeps them together.** `test/api/dependency-ranges.test.ts` checks that the floor
   of the peer range is the version of the `typescript-5.4` development dependency, so raising
   one without the other fails.
3. **Raising the floor is a major** (`docs/compatibility.md`, Versioning); 1.0 is that major
   for users coming from openapi-typescript.

| Option | Pros | Cons |
| --- | --- | --- |
| `>=5.4.0` (chosen) | the range says what is tested and documented; one number everywhere | npm stops with `ERESOLVE` on TypeScript 5.0 to 5.3 (pnpm warns), where the generator alone still runs |
| Keep `>=5.0.0` | no install error on 5.0 to 5.3 | the manifest promises versions that CI does not test and the docs do not support |
| No peer entry | no conflict ever | package managers cannot warn about an unsupported TypeScript at all |

Consequences: a project on TypeScript 5.0 to 5.3 must upgrade TypeScript, or install with
`--legacy-peer-deps`, which is not supported. The migration guide says so.
