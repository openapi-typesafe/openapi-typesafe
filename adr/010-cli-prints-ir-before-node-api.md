# ADR-010: The CLI prints with our printer before the Node API switches to IR

- Status: Accepted
- Date: 2026-11-02

## Context

ENGINEERING_PLAN Phase 5 ends with step 7: output is printed by our printer (ADR-002), and the corpus
shows no regressions. Phase 6 (task 6.1) is the step that makes `openapiTS()` return IR nodes. Until
then the Node API must keep returning `ts.Node[]`, so that the inherited Node API tests and users of
`astToString(await openapiTS(…))` see no change.

Two facts shape step 7:

- The footer (`ctx.injectFooter`) is a public `ts.Node[]` field. User callbacks can add their own nodes
  to it, and the generator mutates its `operations` interface in place.
- Raw declarations (the `--read-write-markers` helper types and the `inject` option) are source text.
  The TypeScript printer reprints parsed text in its own layout; our printer writes raw text as is.

## Decision

1. A new internal module `src/generate.ts` (a separate build entry, not exported from the package
   index) holds `generateTypes(source, options)`. It runs the generator once and prints the result
   with `printNodes`. The CLI uses it. `openapiTS()` is unchanged.
2. The run footer's sink (`lib/footer-sink.ts`) remembers the IR of every footer node it adds, and the
   members of the `operations` interface it created. A footer node without IR (added by a user
   callback, or an `operations` interface changed outside the sink) is printed by the TypeScript
   printer and kept as a raw declaration.
3. Raw declaration text from the generator is reprinted with the TypeScript printer before our printer
   writes it, so output stays byte identical. Text without statements is dropped, as before.
4. Phase 6 removes points 2 and 3 together with the `typescript` dependency: the footer becomes IR,
   and raw text is printed as written (a documented change of the `inject` layout).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Chosen: internal `generateTypes` for the CLI, Node API unchanged | Step 7 is measured on the whole corpus now; no public API change before Phase 6 | Two output paths until Phase 6; temporary IR bookkeeping in the footer sink |
| Make `astToString` detect generator nodes and print them with our printer | One path | Needs a node → IR registry that outlives the run (module state, forbidden), or tags on `ts.Node` objects |
| Wait for Phase 6 and switch both paths at once | No temporary code | Printer and transformer changes land in one step; a regression cannot be traced to either |

## Consequences

- The CLI no longer prints with the TypeScript printer; the Node API still does until Phase 6.
- The CLI still loads `typescript` (the footer nodes and raw text need it) until Phase 6.
- A parity property test checks that both paths print the same text on random documents, options and
  callbacks; the compatibility matrix checks the CLI on the corpus.

## Review trigger

- Phase 6, task 6.1 starts (this ADR is then superseded), or
- a user report shows a difference between CLI output and `astToString(await openapiTS(…))`.
