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
