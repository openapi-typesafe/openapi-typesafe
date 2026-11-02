# Pre-beta test plan

> Our own deep testing before we invite beta testers (ENGINEERING_PLAN 11.1). The unit, property,
> parity, type-matrix, runtime and browser suites already pass. This plan tests the product the
> way a user meets it: installed from the beta tarballs, run on real schemas, read from the docs.
> The goal is to find every defect a tester would hit first, and fix it properly.

**Status:** in progress; PB-1 to PB-7 fixed. **Target:** `1.0.0-beta.2`, then
invite testers.

## 1. Rules for every finding

1. Each defect gets an entry in [§13 Findings](#13-findings): ID (`PB-<n>`), area, severity,
   one-line repro, status. Severity:
   - **S1**: wrong types, a crash, data loss, or a security issue;
   - **S2**: a documented feature does not work, or there is no workaround;
   - **S3**: poor error text, docs mismatch, rough UX.
2. The fix follows CODING_PRINCIPLES:
   - first a failing test that reproduces the defect (unit, property or e2e, at the lowest level
     that shows it);
   - then the fix at the root cause, not a special case for the repro;
   - then a changeset for user-visible changes;
   - an ADR when the fix changes a contract or a systemic decision.
3. The reference for generated output is the `fork-base` tag, as in the compat harness:
   openapi-typescript at the fork point, which already has the unreleased upstream changes of
   7.14. A difference in the generated types from `fork-base` (the harness's type-identity
   check) is a defect unless it is a documented bug fix. A byte-only difference with identical
   types is classified and explained, and counts against the ≥ 99% byte target of §14.
   openapi-typescript 7.13 (what users run today) is the reference for performance (§4.8) and
   for what users see change when they migrate (§8).
4. Verify locally (`VERIFY_FAIL_ON_WARNINGS=1 scripts/verify.sh build lint test size coverage
   types`, plus `npx node@22` / `npx node@24` for the affected suites). Push several fixes at
   once to save CI minutes.
5. Every run writes its log to `.logs/pre-beta/<area>/`. A test is "passed" only with a log.
6. Exit code 70 (an unexpected error with a stack trace) is always a finding, at least S2: the
   docs promise a typed error for every expected failure.

## 2. Test environment matrix

The clean-room projects live outside the repository (`/tmp`-like scratch directories), so the
workspace never resolves anything for them.

| Axis | Values |
|---|---|
| Node.js | 22.12.0 (the generator's lowest, `engines`), latest 22, 24, 26 |
| Package manager | npm, pnpm, Yarn (berry, `nodeLinker: node-modules` and PnP), Bun |
| TypeScript (consumer) | 5.4, 5.9, 6.0, 7.0, 7.1-beta |
| Module system | ESM (`"type": "module"`), CommonJS |
| `moduleResolution` | `bundler`, `node16`, `nodenext` |
| Strict flags | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedDeclarations`, `noPropertyAccessFromIndexSignature` |
| Runtimes (clients) | Node.js, Bun, Deno, Chromium, Firefox, WebKit (all in CI today); a Workers-like runtime (`workerd`, new, §6.11) |
| OS | macOS locally; Linux in CI; Windows only after the repository is public |

Not every combination: the full grid would be thousands of runs. Each section names the slice
it needs: §3 runs every package manager on every Node.js version, `moduleResolution` values are
covered by §3.5, TypeScript versions and strict flags by §4.2, §6.8 (client inference) and
§7.4.

## 3. Install from the beta tarballs (the tester's first 10 minutes)

Follow `RELEASE_NOTES.md` of `beta-1.0.0-beta.1` word by word, as a tester would.

- [x] 3.1 `shasum -a 256 -c SHA256SUMS` passes for the downloaded assets.
- [x] 3.2 Install with npm, pnpm and Yarn, using exactly the `overrides` / `resolutions`
      snippets from the notes. No openapi-typesafe package is looked up on npm. The names now
      exist on npm as deprecated `0.0.0` placeholders, so a missing override fails with "no
      matching version" instead of "not found": check that the notes explain that error. The
      npm snippet uses the `$openapi-typesafe-fetch` reference, which only npm understands;
      the notes tell Yarn users to use `resolutions` "instead": check what Yarn berry needs
      and write it out. Bun has no snippet yet: find the working recipe and add it.
- [x] 3.3 `openapi-typesafe --version` and `--help` work through each manager's own runner
      (`npx`, `pnpm exec`, `yarn`, `bunx`).
- [x] 3.4 Every library package (all except `openapi-typesafe-migrate`, which is a CLI with no
      `exports`) imports in ESM and in CJS (`require`) where its `exports` map says so.
- [x] 3.5 Types resolve for every `moduleResolution` value in §2 (the client packages have no
      `types` condition in `exports` and a `./*` wildcard export: check both): run
      [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
      and [`publint`](https://publint.dev) on each tarball (check the latest versions first).
      CI already runs `attw` (`scripts/check-exports.sh`) and the tarball file check
      (`scripts/check-tarball-files.mjs`) on the workspace packages; what is new here is
      running them on the beta tarballs, whose manifests `pack-beta.sh` rewrites, plus
      `publint`.
- [x] 3.6 Tarball contents: no tests, fixtures, source maps to missing files, `.logs`, or
      personal files; `LICENSE` and `README.md` present; `bin` files have a shebang and run.
- [x] 3.7 `peerDependencies` ranges: install with the lowest and the highest allowed version;
      no peer warnings. `@tanstack/react-query` `^5.80.0` for the React Query client. The
      generator's optional `typescript` peer says `>=5.0.0`, while ADR-006 supports 5.4+ and
      ADR-004 tests the legacy callbacks with 5.9 and 6.x: test 5.0 and 5.4 with those
      callbacks, then fix the range or the docs. Also the optional `@typescript/typescript6`
      `^6.0.0` peer, and the React Query client's peer on `openapi-typesafe-fetch` (pinned
      exactly in the beta tarballs). Lowest allowed runtime dependencies too: see PB-2.
- [x] 3.8 The migration path from the notes: `openapi-typesafe-migrate --write`, then replace
      `^1.0.0-beta.1` with the `file:` paths. Check that the notes are enough on their own.

**§3 results** (logs: `.logs/pre-beta/install/`): checksums pass; npm, pnpm, Yarn 4 and Bun 1 install,
generate, type-check (strict, `nodenext`) and import in ESM and CJS on Node.js 26 after PB-8;
`attw` finds no problems; publint: PB-9; tarballs hold no stray files, every source map embeds its
sources, both `bin` files have a shebang; the legacy TypeScript-node callbacks work with
TypeScript 5.0.4, 5.4.5, 5.9.3 and with `@typescript/typescript6` alone, so the `>=5.0.0` peer is
right; the React Query client installs with TanStack Query 5.80.0 and 5.105.2 without peer
warnings; the migration path of the notes works end to end.

## 4. Generator on real schemas

Inputs: the 7 example schemas in `packages/openapi-typesafe/examples/` (GitHub, Stripe,
DigitalOcean and smaller ones), the compat corpus (1,820 documents), and large public APIs not in
them, picked by hand: Kubernetes, Cloudflare, Twilio, Slack, Jira, and a 3.1 document with
webhooks.

- [ ] 4.1 Full compat run, all option sets, locally (Node.js ≥ 22.18; first
      `pnpm --filter openapi-typesafe run build`; then from `tools/compat-harness`):
      `scripts/prepare-generators.sh`, `node src/cli/main.ts fetch --corpus all`, then
      `scripts/run-compat.sh all all`. Every difference from `fork-base` is classified:
      documented fix, byte-only difference with identical types, or defect. The report's
      `upstream-7.13.0` vs `fork-base` part lists what users of 7.13 will see change.
- [ ] 4.2 Generated output type-checks with every strict flag of §2: the whole corpus with
      the default options under TypeScript 5.4 and 7.0, and every option set on the example
      schemas under every TypeScript version (the type matrix covers a sample today).
      `examples/digital-ocean-api.ts` and `examples/enum-root-types.ts` are excluded from
      `tsconfig.examples.json` and the type-matrix consumer: include them or record why.
- [x] 4.3 Generated output has no `any` that the schema did not ask for, and is stable: two
      runs on the same input give the same bytes, also with a different key order in YAML.
- [x] 4.4 OpenAPI versions: 3.0.x, 3.1.x (incl. `type` arrays, `const`, `$defs`,
      `unevaluatedProperties`, `prefixItems`, webhooks), 3.2 (the docs say "accepted": check
      which 3.2 features give correct types and document the rest), Swagger 2.0 (the docs say
      "not supported": check that the error says so).
- [x] 4.5 Inputs: JSON, YAML (anchors, BOM, CRLF; multi-document and tab indents must fail
      with a clear message), a URL (also with the auth headers of `redocly.yaml`, see "Auth" in
      `docs/cli.md`), stdin, a `redocly.yaml` with several APIs, multi-file `$ref` (relative,
      absolute, URL, circular, to a JSON pointer with `~0`/`~1`/`%`). Output: to a file, and to
      stdout when `--output` is not given.
- [ ] 4.6 Every CLI flag alone, and every pair that interacts. The harness matrix
      (`tools/compat-harness/src/domain/option-matrix.ts`) has single flags and three pairs
      (`--root-types` × its two modifiers, `--enum` × `--dedupe-enums`); add `--enum` ×
      `--enum-values`, `--enum` × `--conditional-enums`, `--immutable` × `--read-write-markers`
      and `--export-type` × `--root-types`. Flags whose default is `true`
      (`--default-non-nullable`) need their negative form (`--default-non-nullable=false`).
      Compare flags that exist in `fork-base` with it; test the new flags (`--no-lint`,
      `--local-ref-root`, `--remote-ref-hosts`) against their docs and ADR-017.
- [x] 4.7 `--check`: up to date, out of date, missing output. Every row of the exit-code table
      in `docs/cli.md` (0, 1, 2, 3, 4) is reached with the listed error codes. With several
      APIs in `redocly.yaml`, the others still run when one fails, and the exit code is the
      first failure's. `--check` with no output (see PB-4).
- [ ] 4.8 Performance: time and peak memory on the largest documents (GitHub, Stripe,
      Kubernetes), 5 runs each, median. Budget: at most 10% slower than openapi-typescript
      7.13 (users notice more than that in watch scripts and CI).
- [x] 4.9 Paths: spaces, Unicode, symlinks, relative to `cwd` vs to the config file; output
      into a missing directory.

**§4 results** (logs: `.logs/pre-beta/generator/`):

- 4.4: a 3.1 document with `type` arrays, `const`, `$defs`, `unevaluatedProperties`,
  `prefixItems`, a discriminator and webhooks gives correct types, equal to `fork-base` apart
  from the branding and PB-10. `fork-base` rejects 3.2 documents; ours generates them, with the
  gaps of PB-12 now warned and documented. `$defs` gave PB-10 and PB-11. Swagger 2.0 fails with
  `SCHEMA_VERSION_UNSUPPORTED` and says it is not supported. 3.0 is covered by the corpus (4.1).
- 4.3: the generator never writes `any` (no `any` type node in any example output). Two runs give
  the same bytes (GitHub, Stripe); with `--alphabetize`, Stripe with every key order reversed
  gives the same bytes. Without it the output follows document order, as in the original.
- 4.5: JSON, YAML with anchors, a BOM and CRLF, and stdin (JSON and YAML) generate. A second YAML
  document and tab indents fail with exit 3 and a clear message (PB-13). A URL behind a header
  works with the `resolve.http.headers` of `redocly.yaml` and fails with 401 without it; the
  header also reaches `$ref`ed files on that host. Relative, absolute, remote and circular `$ref`s
  work; `~0`, `~1` and `%25` gave PB-14. Several APIs: each one is generated, a broken one does
  not stop the others and sets the exit code, `--check` finds a stale one (PB-15).
- 4.7: every code of the exit-code table has a test (`test/cli/`, `test/api/`); the mapping is a
  `Record` over all error codes, so a new code without an exit code does not compile. Up to date,
  stale and missing output, and several APIs with one failing were run by hand (see 4.5).
- 4.9: spaces and Unicode in input, `$ref` and output paths, an absolute path, a `file://` URL
  with escapes, and output into missing directories work. A config's `root` and `output` are
  relative to the config, also when run from another directory. A symlinked root resolves
  relative `$ref`s next to the link, as `fork-base` does (RFC 3986); `docs/cli.md` says so now.

## 5. Node API

- [x] 5.1 Every example in `docs/node.md` runs as written (copy-paste into a fresh project).
- [x] 5.2 Every CLI flag behaves like its Node API option. Options that have no flag
      (`transform`, `postTransform`, `transformProperty`, `irCallbacks`, `inject`, `silent`,
      `cwd`, the Redocly config object) are documented in `docs/node.md`; the deprecated
      TypeScript-node callbacks warn once. Deprecated exports (`stringToAST` with its
      `DeprecationWarning`, `resolveRef`, `walk`, `c`, `debug`, `warn`, `error`,
      `scanDiscriminators`, see `.changeset/deprecate-*.md`) still work; `stringToAST` warns at
      run time, the others are `@deprecated` in the types only.
- [x] 5.3 Input kinds (`SchemaSource`): parsed object, YAML or JSON string, a string that
      starts with `http(s)://` or `file://`, `URL` (file and remote), `Buffer`, `Readable`
      stream (also one that emits an error, see PB-5); `transform` / `postTransform`
      callbacks; `astToString`. A plain file path string is parsed as YAML, not loaded (PB-6).
- [x] 5.4 Errors: each entry of `ERROR_CODES` (`src/domain/errors.ts`) that the Node API can
      raise (all except `CLI_*` and `OUTPUT_*`, which §4.7 covers) is reachable, typed as
      ADR-011 says, and has a useful message.
- [x] 5.5 Concurrency: many parallel `openapiTS()` calls give the same output as sequential
      ones (no shared state between runs).

**§5 results** (logs: `.logs/pre-beta/node/`):

- 5.1: every `docs/node.md` example was run and type-checked (`strict`, `nodenext`) in a fresh
  project installed from the packed tarball; this found PB-16 and PB-17.
- 5.2: for every generator flag, the CLI output equals the Node API output of the same option on
  two example schemas (42 pairs), and a type test keeps every flag a boolean option. The other
  options are in the `docs/node.md` table. The TypeScript-node callbacks warn once per run;
  every deprecated export works, and `stringToAST` emits one `DeprecationWarning`.
- 5.3: an object, YAML and JSON text, `http://` and `file://` strings, file and remote `URL`s, a
  `Buffer`, a `Readable` and a file stream all generate. A path string gave PB-18.
- 5.4: every Node API error code is reached by a test (see 4.7) and is an
  `OpenAPITypesafeError` with `code` and `details`.
- 5.5: 18 runs (3 schemas × 6 option sets, `--enum`, `--dedupe-enums`, `--root-types` and more)
  in parallel, 3 rounds, give the same bytes as sequential runs.

## 6. Fetch client (`openapi-typesafe-fetch`)

Against a local test server (`node:http`) for a test schema. The full list runs on Node.js;
Bun, Deno and the browsers run a smoke subset through the existing runtime and browser suites.

- [x] 6.1 Every HTTP method; path parameters in every style (`simple`, `label`, `matrix`,
      with and without `explode`), query and header parameters. Cookie parameters are typed
      but not sent, as in openapi-fetch: check that the docs say so. `TRACE` is rejected by
      the platform's `Request` (ADR-013, item 5): check the error is clear.
- [x] 6.2 Query serialization: `form`/`spaceDelimited`/`pipeDelimited`/`deepObject`, `explode`
      true/false, arrays, nested objects, `null`/`undefined`, reserved characters, Unicode.
- [x] 6.3 Bodies: JSON, `application/x-www-form-urlencoded`, `multipart/form-data` with files,
      `Blob`, `ArrayBuffer`, streams, custom `bodySerializer`. Expected today: the client
      builds `URLSearchParams` only when the caller sets `Content-Type:
      application/x-www-form-urlencoded`; any other non-`FormData` body, `Blob` and
      `ArrayBuffer` included, goes through `JSON.stringify` unless a `bodySerializer` is given.
      Check nested form values, and whether that default surprises users (docs or fix).
- [x] 6.4 Responses: JSON, text, empty (204 / `content-length: 0`), binary, stream,
      `parseAs` options; `data`/`error` narrowing by status in the types.
- [x] 6.5 Errors: network failure, abort (`signal`), non-JSON error body, thrown middleware.
- [x] 6.6 Middleware: order, `onRequest`/`onResponse`/`onError`, replacing the request,
      retry, auth refresh (the recipe in `docs/fetch/middleware-auth.md`).
- [x] 6.7 Options: `baseUrl` with and without a trailing slash, custom `fetch`, `Request`
      subclass, default and per-call headers (merge and removal), `querySerializer` override.
- [x] 6.8 Types: inference for every operation in the GitHub and Stripe schemas gives no
      `any` (type tests with `expectTypeOf`). Record the type-check time and instantiation
      count (`tsc --extendedDiagnostics`) against openapi-fetch 0.17 as the baseline.
- [x] 6.9 Behaviour parity with openapi-fetch 0.17: same requests on the wire for the same
      calls, except the documented fixes: ADR-013, `.changeset/cross-realm-headers.md`,
      `.changeset/fix-empty-error-response.md`.
- [x] 6.10 The rest of the public API (`src/index.d.ts`): `createPathBasedClient`,
      `wrapAsPathBasedClient`, `client.request()`, `use()` / `eject()`, the `pathSerializer`
      and `requestInitExt` options, the `Media` type parameter, and output generated with
      `--read-write-markers` (`Readable` / `Writable` request and response types).
- [x] 6.11 A smoke run of the client in `workerd` (Cloudflare Workers runtime), new.
- [x] 6.12 `openapi-typesafe-helpers` has no runtime code of its own: its types are checked
      through 6.8, and its public type names match openapi-typescript-helpers, so code that
      imports them directly keeps compiling after §8.

**§6 results (6.1–6.7, 6.9).** A wire stand (71 scenarios: every method, path, query, header and
cookie styles, bodies, responses, errors, options, middleware) ran each call through
openapi-typesafe-fetch and openapi-fetch 0.17.0 against a recording `node:http` server
(`.logs/pre-beta/fetch/6-wire.log`). The only difference was the documented empty error body. It
found PB-19..21, all inherited; after the fixes the differences are those three plus the empty error
body (`6-wire-after-fix.log`). Same as openapi-fetch and documented: cookies are not sent (PB-22),
`TRACE` rejects with the platform's `TypeError: 'TRACE' HTTP method is unsupported.`, deeper query
nesting throws a clear error, and a text response with the default `parseAs` rejects with
`SyntaxError`. The `Request` subclass and the auth recipe are covered by `test/common/request.test.ts`
and the stand's retry middleware. The bundle budget rose to 8 kB (ADR-013, consequences).

**6.8 results.** `test/examples/no-any.test.ts` (checked by `tsc` in `lint:ts`) finds no operation of
the GitHub and Stripe schemas whose `data`, `error` or init is `any`; a control case proves the check
fires. `tsc 5.9.3 --extendedDiagnostics` on a typed `GET` call for every GET path (540 GitHub, 257
Stripe), against openapi-fetch 0.17.0 (`.logs/pre-beta/fetch/6.8-diagnostics.log`):

| Schema | Instantiations, ours / openapi-fetch | Types | Check time (machine under load) |
|---|---|---|---|
| GitHub | 575,049 / 575,702 | 56,940 / 57,063 | 1.75 s / 2.59 s |
| Stripe | 278,635 / 279,329 | 29,687 / 29,668 | 1.00 s / 0.99 s |

No errors in either. The type cost is the same as openapi-fetch; times are rechecked in §4.8.

**6.10–6.12 results.** 6.10: the package tests cover `createPathBasedClient` and
`wrapAsPathBasedClient` (`test/path-based-client/`), `use()`/`eject()` (`test/middleware/`),
`pathSerializer`, `requestInitExt` (`test/common/create-client-e2e.test.js`), the `Media` parameter
and `$Read`/`$Write` output (`test/read-write-visibility/`); the wire stand also ran `request()`,
`requestInitExt` and `eject()`. 6.11: workerd 1.20261102.1 ran the built client
(`.logs/pre-beta/fetch/6.11-workerd.json`): path and query encoding, JSON, `Blob` and form bodies,
204, an error body and middleware all behave as on Node.js, with no runtime warnings. 6.12: the 31
exported type names of openapi-typesafe-helpers equal those of openapi-typescript-helpers 0.1.0
(the version openapi-fetch 0.17 uses); its two extra names are not exported
(`6.12-*-names.txt`).

## 7. React Query client (`openapi-typesafe-react-query`)

- [x] 7.1 `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `queryOptions`
      with React 18 and 19 and TanStack Query 5.80 (lowest allowed) and the latest 5.x.
- [x] 7.2 Query keys: stable, unique per params, usable for `invalidateQueries`.
- [x] 7.3 Server rendering and hydration (`renderToString` plus `HydrationBoundary`; the
      React Query client has no Next.js example, the fetch client has one), Suspense
      boundaries, error boundaries.
- [x] 7.4 Types with `exactOptionalPropertyTypes` (ADR-009).
- [x] 7.5 Every example in `docs/react-query/*` compiles and runs.
- [x] 7.6 An error response with an empty body fails the query (ADR-013, decision 3); `signal`
      is passed and cancels the request; `pageParamName` of `useInfiniteQuery`; the typed
      `queryKey` (`DataTag`) works with `setQueryData` / `getQueryData`.

**§7 results.** 7.1: the package suite (43 tests, then 49) passes on React 18.3.1 and 19.3.1 with
TanStack Query 5.80.12 and 5.105.2, installed from packed tarballs (`.logs/pre-beta/react-query/7.1-*`).
Our declarations type-check on all four; on 5.80 only our own test fails to compile, because it uses
the four-argument `onError`/`onSettled` of newer TanStack releases (users get the signature of their
TanStack version). 7.2, 7.3, 7.6: new `test/query-cache.test.tsx` (param order, distinct keys,
prefix invalidation, typed `getQueryData`/`setQueryData`, `cancelQueries` aborts, `renderToString`
with `HydrationBoundary` makes no request), green on all four combinations; Suspense and error
boundaries, `signal` and `pageParamName` were covered already. 7.4: consumer code (the package
tests) compiles with `exactOptionalPropertyTypes` on both TanStack versions; our source still does
not (ADR-009 stands). 7.5: PB-23; after the fix every `docs/react-query` example compiles
(`noUncheckedIndexedAccess`, bundler resolution) and renders against msw
(`7.5-docs-run.log`). The "1 kb" claim holds: 1.1 kB minified.

## 8. Migration tool (`openapi-typesafe-migrate`)

On real projects. Start with the existing tool: `pnpm harness dependents --switch migrate`
(from `tools/compat-harness`) clones the 15 projects of `corpus/dependents.json` at pinned
commits, runs their checks before and after the migration (see "Real projects" in its README).
Then add more projects from `research/dependents.csv` that the harness does not cover.

- [x] 8.1 Dry run lists every change; `--write` applies exactly those.
- [x] 8.2 After the migration the project installs, generates, type-checks and passes its own
      tests. Each failure is ours or documented in the migration guide.
- [x] 8.3 What it rewrites, each on a real case:
      - sources: static, type-only and dynamic imports, `require()`, re-exports, `vi.mock()`,
        `declare module`, deep imports (reported as manual steps), `transform` callbacks;
      - manifests: dependency fields and `package.json` scripts are rewritten; peer
        dependencies and `overrides`/`resolutions` that name an old package are reported as
        manual steps; pnpm `catalog`/`catalogs` in `pnpm-workspace.yaml` are rewritten, but
        its `overrides:` are neither rewritten nor reported (check: finding or docs);
        monorepos (pnpm, npm, Yarn);
      - commands and flags in `.yml`/`.yaml` (CI workflows), `.sh`, `Makefile`, `justfile` and
        `Dockerfile`;
      - it skips `node_modules`, `.git` and `dist` only: check that build output in other
        folders (`build`, `.next`, `coverage`) and committed generated files are handled
        sensibly.
- [x] 8.4 Running it twice changes nothing the second time; it never touches lockfiles
      (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock` are skipped by name; check `package-lock.json`
      too) or files outside `--root`. The guide and the README already say to start from a
      clean git tree; decide whether the tool should also warn. The `--log` option and the
      exit codes 0/1/2 work as its `--help` says.
- [x] 8.5 `docs/migration-guide.md` steps work word by word.

**§8 results (8.1, 8.3, 8.4; 8.2 and 8.5 below).** `pnpm harness dependents --switch migrate` on
the 15 projects of the manifest: 15 passed, 0 regressed (two Bun projects need `bun` on `PATH`; run
with `npx -p bun`); 7 projects from `research/dependents.csv` were added (8.2: 22 passed, 0
regressed, generated files identical; see `research/phase8-real-projects.md`) (`.logs/pre-beta/migrate/8.1-dependents*.log`). A synthetic project with every case
of 8.3 (`scratchpad/migrate-cases`) found PB-24..26; static, type-only and dynamic imports,
`require()`, re-exports, `vi.mock()`, `declare module`, deep imports (reported), `transform`,
manifests, catalogs, CI YAML, `.sh`, `Makefile`, `justfile` and `Dockerfile` are all handled. A second
`--write` changes nothing; `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` and files outside
`--root` are untouched; exit codes match the README (PB-27 for `--help`). The README and the guide
already say to start from a clean tree; the dry run is the default, so no extra warning.
`docs/migration-guide.md` now lists the client fixes of PB-19..21 and the 3.2 warnings.

## 9. Documentation and examples

- [ ] 9.1 Every code block in `docs/` and every `README.md` is either compiled by a test or
      checked by hand in a fresh project. List the ones not covered by tests.
- [x] 9.2 Every CLI flag, option and error code in the code is documented, and every
      documented one exists. Known: PB-1; the `-c` alias of `--redocly` is missing from the
      flag table of `docs/cli.md`; `--content-never` is accepted on purpose but read by no code
      (`cli-arguments.ts`): document it as ignored or remove it with a changeset; PB-7.
- [x] 9.3 The docs site (VitePress) builds, all links work, the local search finds the main
      topics, and it reads well on a phone.
- [x] 9.4 `docs/typescript-7.md` claims are checked against the real TypeScript 7 releases.
- [x] 9.5 The example apps `packages/openapi-typesafe-fetch/examples/{nextjs,sveltekit,vue-3}`
      (linked from `docs/fetch/examples.md`) install, build and run; nothing builds them today.
- [x] 9.6 `llms.txt` and `llms-full.txt` of the docs site are generated and complete.

**§9 results (9.2–9.6).** 9.2: the CLI flags and aliases of `cli-arguments.ts` equal the
`docs/cli.md` table (`--no-lint` is the form of `lint`; `-c` and `--content-never` are documented);
the 25 error codes of `errors.ts` are all documented; added the deprecated exports with
`OPENAPI_TYPESAFE_DEP_STRING_TO_AST`, and the `redocly` and `version` options to `docs/node.md`.
9.3: the site builds with no warnings, `check-links` passes (479 links), the local search index
holds every main topic, and all 21 pages at iPhone 13 width have no page overflow and no console
errors (wide tables scroll inside themselves) (`.logs/pre-beta/docs/9.3-*`). 9.4: every claim of
`docs/typescript-7.md` reproduced with typescript 7.0.2: npm `ERESOLVE`, pnpm `unmet peer`,
`ts.factory` undefined and the `createKeywordTypeNode` crash; openapi-typesafe installs and
generates next to it, `postTransform` without TypeScript 6 fails with `TYPESCRIPT_NOT_FOUND`, and
works with `@typescript/typescript6@6.0.2`. 9.5: `nextjs` (`next build`), `sveltekit` (`vite
build`, `svelte-check`) and `vue-3` (`generate`, `vue-tsc`, `vite build`) build with no warnings,
and the regenerated types equal the committed ones; they call live APIs, so they were not run.
9.6: `llms.txt` lists every page and `llms-full.txt` has the new sections.

## 10. Security (threat model)

Each threat in `docs/security/threat-model.md` that is marked "Controlled" gets hostile inputs
that try to defeat its control. T7 (trusted inputs: Redocly plugins, callbacks, `inject`) is
accepted by design and has no test.

- [ ] 10.1 T1, code injection into the generated file: descriptions, names and enum values with
      `*/`, backticks, `${}`, quotes, Unicode line separators U+2028/U+2029.
- [ ] 10.2 T2, denial of service: deep nesting, huge documents, YAML alias bombs, long `$ref`
      chains, slow remote hosts.
- [ ] 10.3 T3 and T4, `$ref` limits: `--local-ref-root` escape attempts (`..`, symlinks,
      `file://`, encoded paths), `--remote-ref-hosts` bypass attempts (redirects, userinfo,
      IPv6, uppercase hosts, trailing dots).
- [ ] 10.4 T5, unsafe requests from the fetch client: path values with `..`, `/`, `?`, `#` and
      encoded forms (expect percent-encoding, and an error for a dot segment, ADR-013; see
      PB-3); query values with and without `allowReserved` (it applies to query parameters
      only), and values that try to add parameters; header values with line breaks.
- [ ] 10.5 T6, supply chain: `pnpm audit` (the known `@redocly/openapi-core` 1.x advisories are
      listed in `research/backlog.md`, item 2, and ADR-005's review trigger covers a 1.x
      advisory without a fix; anything new is a finding), licenses of all production dependencies,
      no install scripts in our packages.
- [ ] 10.6 Not in the threat model: prototype keys (`__proto__`, `constructor`, `prototype`) in
      schemas, paths and parameters, in the generator and in the clients' serializers. A
      finding here also updates the threat model.

## 11. Agent skill

- [ ] 11.1 CI runs only `validate` (the reference solutions). Run
      `pnpm --filter @openapi-typesafe/skill-evals eval` once with a real agent (Claude Code,
      with `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`); it costs money, so agree the
      budget first.
- [ ] 11.2 Every command and API name in `skills/openapi-typesafe/` exists and matches the docs.

## 12. Exploratory testing

Time-boxed sessions without a script, one per area, writing what was tried:

- [ ] 12.1 A new user builds a small app from `docs/introduction.md` only.
- [ ] 12.2 A user of openapi-typescript 7 upgrades a real project.
- [ ] 12.3 Hostile and odd schemas: empty document, only `components`, no `paths`,
      duplicated `operationId`, 10,000 operations, non-ASCII everywhere.
- [ ] 12.4 Error messages: trigger each error on purpose and judge whether a user can fix the
      problem from the message alone.

## 13. Findings

| ID | Area | Severity | Repro | Status |
|---|---|---|---|---|
| PB-1 | CLI | S3 | `openapi-typesafe --help` does not list `--generate-path-params`, which `docs/cli.md` documents and the CLI accepts | fixed: help line added; a test checks every generator flag in `--help` and `docs/cli.md`; `-c` and `--content-never` documented |
| PB-2 | generator deps | S2 | `@redocly/openapi-core` range is `^1.34.6`, but 1.34.6 rejects OpenAPI 3.2 (ADR-005), which the docs say is accepted: an install that resolves the lowest allowed version fails on 3.2 documents. Raise the lower bound to the first version that accepts 3.2 | fixed: range `^1.34.22` (1.34.15 is the first 1.x that accepts 3.2; 1.34.23 is blocked by the minimum release age); `dependency-ranges.test.ts` |
| PB-3 | docs, fetch | S3 | `docs/security/threat-model.md` T5 says dot segments in path values "are encoded"; the client throws `Dot path segment in …` (ADR-013) | fixed: threat model T5 describes the encoding and the dot-segment error |
| PB-4 | CLI | S2 | `openapi-typesafe schema.yaml --check` with no `--output` and no APIs in `redocly.yaml` prints the types and exits 0 without checking anything (`run-cli.ts`); compare with `fork-base`, then fail or document | fixed: new `CLI_CHECK_OUTPUT_MISSING`, exit 2; docs and migration guide updated (`fork-base` had the same bug) |
| PB-5 | Node API | S2 | `openapiTS(stream)` with a `Readable` that emits `error` never settles: `readStream` in `schema-source.ts` has no `error` listener | fixed: `readStream` uses `node:stream/consumers` and rejects with `SCHEMA_LOAD_FAILED`; the new test hung before the fix |
| PB-6 | docs, Node API | S3 | `docs/node.md` says a string loads "a local file"; a plain path string is parsed as YAML, only `file://` / `http(s)://` strings are loaded | fixed: `docs/node.md` says which strings load and how to load a path (`pathToFileURL`) |
| PB-7 | CLI | S3 | `CLI_GLOB_UNSUPPORTED` and `CLI_CONFIG_OUTPUT_MISSING` messages link to the upstream site `https://openapi-ts.dev/cli/#multiple-schemas` (`run-cli.ts`, `redocly-apis.ts`) | fixed: one `MULTIPLE_SCHEMAS_DOCS_URL` constant pointing at our docs; e2e test |
| PB-8 | beta notes | S2 | Yarn Berry fails on the npm-only `$openapi-typesafe-fetch` reference, Bun has no recipe and fails with "No version matching 1.0.0-beta.1", and the notes said migrate sets `^VERSION` (it keeps the old `^`/`~`/exact style) | fixed: `scripts/release/beta-release-notes.md` has a tested Yarn/Bun snippet, explains the placeholder error and the version style |
| PB-9 | packaging | S3 | publint warns on the `./*` export of `openapi-typesafe` and `openapi-typesafe-fetch` (CJS `__esModule` + `default` reachable from ESM) | accepted in ADR-018 (kept for deep-import compatibility); publint now runs in `scripts/check-exports.sh` at the error level |
| PB-10 | generator | S1 | inherited (upstream #2664): a schema's `$defs` is printed as a required member, so values need a `$defs` key | fixed: `$defs?:`, refs past it use `NonNullable<…>`; legacy bug 17; `test/api/defs-types.test.ts` |
| PB-11 | generator | S1 | inherited: the root `$defs` is `Record<string, never>`, so every `#/$defs/<name>` ref is `never` | fixed: one member per subschema; legacy bug 18; `test/api/defs-types.test.ts` |
| PB-12 | generator | S2 | 3.2 `query`, `additionalOperations`, `in: querystring` and `itemSchema` are dropped from the output without a word, while the docs say 3.2 is "accepted" | each use now warns with its JSON Pointer; docs list what 3.2 generates ("OpenAPI 3.2 features" in `docs/introduction.md`). Generating them is a feature for after 1.0 (needs a `QUERY` method in the fetch client) |
| PB-13 | loader | S3 | a YAML or JSON file that does not parse fails with `SCHEMA_LOAD_FAILED` (text input gives `SCHEMA_PARSE_FAILED`), and a second YAML document's message does not name the file | fixed: `SCHEMA_PARSE_FAILED` with the file in the message; `test/api/schema-load-errors.test.ts` |
| PB-14 | loader | S1 | inherited: an external `$ref` to a key with `~`, `/` or `%` (`#/a~0b`, `#/50%25`) bundles into a ref that names another key (types do not compile) or is malformed (exit 70); a malformed `%` in a local `$ref` is exit 70 too | fixed: the loader repairs Redocly's bundled refs; a malformed `%` fails with `SCHEMA_REF_INVALID` naming the ref; `test/api/bundled-pointer-escapes.test.ts` |
| PB-15 | CLI | S3 | `--check` says "Generated types are not up-to-date!" without the file, so with several APIs it does not tell which one | fixed: the message names the output file |
| PB-16 | types | S3 | inherited: the public `StringSubtype` has no `minLength`, `maxLength` or `pattern`, so the `transformProperty` example of `docs/node.md` does not compile under `strict` | fixed: the keywords are in the type; `test/api/schema-object-types.test.ts` |
| PB-17 | docs | S2 | inherited: `docs/node.md` examples: YAML with `type: object;` and `required: true`, diffs that do not match the output, a Redocly config example that does not parse, a "must return a string" claim, and every callback example in the deprecated TypeScript-node form (which warns) | fixed: every example runs and type-checks in a fresh project, in the IR form |
| PB-18 | Node API | S3 | inherited: `openapiTS("./openapi.yaml")` fails with "Unsupported schema format, expected `openapi: 3.x`", which does not say the string was read as YAML | fixed: `SCHEMA_SOURCE_INVALID` that says to pass `pathToFileURL(path)` |
| PB-19 | Fetch | S2 | inherited: a `Blob`, `File`, `ArrayBuffer`, typed array or `URLSearchParams` body was JSON-encoded to `{}`, so a `format: binary` upload lost its data | fixed: sent as is, no JSON `Content-Type` (ADR-013, decision 6) |
| PB-20 | Fetch | S3 | inherited: a nested object in a urlencoded body was sent as `[object Object]` | fixed: throws and names `bodySerializer()` (ADR-013, decision 7) |
| PB-21 | Fetch | S3 | inherited: a path with `?` plus `params.query` got a second `?` | fixed: joined with `&` (ADR-013, decision 8) |
| PB-22 | Docs | S4 | the fetch docs did not say that cookie parameters are typed but not sent | fixed: note in `docs/fetch/api.md` |
| PB-23 | Docs | S3 | inherited: the `docs/react-query` `useQuery` examples checked `!data` before `error`, so a failed request showed "Loading..." forever; the `useInfiniteQuery` example did not compile (undefined `ErrorBoundary`, `MyComponent`); the `useSuspenseQuery` example had no `Suspense` and read `message` from an `unknown` error | fixed: every example compiles and renders against a mock server |
| PB-24 | Migrate | S4 | override keys were matched as substrings: a `pnpm.overrides` entry for `openapi-typescript-helpers` also reported `openapi-typescript` | fixed: keys are read as the package they target (pnpm `>` chains, Yarn paths, versions) |
| PB-25 | Migrate | S3 | `overrides:` and `patchedDependencies:` in `pnpm-workspace.yaml` that name an old package were neither rewritten nor reported | fixed: reported as manual steps, like `package.json` |
| PB-26 | Migrate | S4 | `.next`, `coverage` and other tool output folders were rewritten (noise in the dry run and the diff) | fixed: skipped like `dist`; `build` and `out` stay in (may hold sources) |
| PB-27 | Migrate | S4 | `--help` did not list the exit codes the README documents | fixed |

## 14. Exit criteria (before inviting testers)

- Every section run, each with its log in `.logs/pre-beta/`; §11.1 may wait for the budget.
- All S1 and S2 findings fixed; S3 findings fixed or filed as issues with a reason.
- §3 passes with every package manager on every Node.js version of §2.
- §4.1 compat report: ≥ 99% byte match, 100% type identity, every difference classified.
- `1.0.0-beta.2` packed from the fixed `main` and the private release updated.
