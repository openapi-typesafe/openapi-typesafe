# ADR-012: Composition roots and ports for the CLI and the Node API

- Status: Accepted
- Date: 2026-11-02

## Context

ENGINEERING_PLAN 4.5 and task 7.3 ask for the CLI in TypeScript in `cli/`, for one composition root per
entry point, and for every outside dependency behind a port. Before this decision:

- `bin/cli.js` was plain JavaScript outside `src/`. It read `process.argv`, the file system, stdin and
  `@redocly/openapi-core` directly, and called `process.exit(0)` in the middle of a run (legacy bug #11).
- The schema loader (`lib/redoc.ts`) and the generator logged through module functions that read
  `process.env.DEBUG` and wrote to `console`; the Node API created its Redocly config inside the loader.
- `src/lib/` held the Node API next to inherited helpers, outside the layers.

## Decision

1. **Ports in `application/ports/`.** `Logger`, `SchemaLoader`, `FileReader` / `FileWriter` and
   `RedoclyConfigSource`. They are types only and import no package.
2. **Adapters in `adapters/`.** `terminal-logger` (the original line formats, colors decided at creation),
   `redocly-loader` (`createRedoclySchemaLoader`, `createRedoclyConfigSource`), `node-file-system`
   (failures become `OUTPUT_READ_FAILED` / `OUTPUT_WRITE_FAILED`).
3. **Two composition roots.**
   - Node API: `api/openapi-ts.ts`. `openapiTS(source, options)` wires the default ports
     (`defaultGeneratorPorts`); `generateDeclarations(source, options, ports)` runs with any ports. The
     process environment (`DEBUG`, color support) is read only in `api/default-ports.ts`.
   - CLI: `cli/main.ts`, the only CLI module that touches `process`. `cli/run-cli.ts` is the use case: it
     gets every dependency through `CliDependencies` and returns the exit code. `bin/cli.js` only imports
     the built `dist/cli/main.mjs`.
4. **Enforced.** The dependency-cruiser rule `adapters-only-in-composition-roots`: outside `adapters/`,
   `api/`, `cli/` and `src/index.ts` an adapter may be imported for its types only.
5. **Orchestration stays in `api/` for 1.x.** The run's context is the public `GlobalContext`, which the
   exported transformers take, so the run is built in `api/` and not in `application/`. The context carries
   the run's logger as an `@internal` field.
6. **Legacy side effect kept.** The exported `c` (ansi-colors) is still switched off at import when the
   terminal has no colors, as before. The generator's own logger uses a separate ansi-colors instance.
7. **Every API of a Redocly config is generated or checked.** The CLI waits for all APIs
   (`Promise.allSettled`), prints one line per failure, and exits with the code of the first failure in
   config order. With `--check`, an up-to-date output is left alone and prints nothing; a stale one fails
   with `OUTPUT_STALE`. This fixes legacy bug #11.
8. **Only documented flags reach the generator.** The original passed every parsed flag into the options,
   so undocumented flags such as `--silent` reached the Node API by accident. The CLI now passes the
   documented boolean flags only.
9. **`src/lib/` is gone.** Its modules moved to `api/` (the Node API and its inherited helpers) and to
   `adapters/redocly-loader/`; `transformSchema` moved from `transform/index.ts` to
   `api/transform-schema.ts`. The paths inside `dist/` are not a public contract; the package entry is.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Chosen: ports, adapters, one root per entry point | Each part is tested with in-memory fakes; the CLI has no hidden process access; the rule is checked in CI | More files; the CLI needs a build before it runs |
| Keep `bin/cli.js` in JavaScript and test it end to end only | No build step for the CLI | No types; slow tests; process access everywhere |
| An Effect-style service container | One mechanism for every dependency | A runtime dependency and a new style in a package whose public API is plain functions |
| Move the run into `application/` now | Cleaner layering | `GlobalContext` is public; moving it changes exported types in 1.x |

## Consequences

- The CLI's behavior and output are the same, except bug #11 (several APIs with `--check`) and flags that
  were never documented. The compatibility harness shows no output change.
- Deep imports of `dist/lib/*` and `dist/transform/index.*` no longer resolve. The package was not
  published under this name, so no user depends on them.
- New outside dependencies must come through a port; the dependency-cruiser rule fails the build otherwise.

## Review trigger

- 2.0 planning starts (then `GlobalContext` can leave the public API and the run can move to
  `application/`), or
- a second CLI command is added (then `run-cli.ts` becomes a command registry).
