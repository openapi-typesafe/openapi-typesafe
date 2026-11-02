# Pre-beta test plan

> Our own deep testing before we invite beta testers (ENGINEERING_PLAN 11.1). The unit, property,
> parity, type-matrix, runtime and browser suites already pass. This plan tests the product the
> way a user meets it: installed from the beta tarballs, run on real schemas, read from the docs.
> The goal is to find every defect a tester would hit first, and fix it properly.

**Status:** not started. **Target:** `1.0.0-beta.2`, then invite testers.

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
3. A difference from openapi-typescript 7.13 is a defect unless it is a documented bug fix.
4. Verify locally (`VERIFY_FAIL_ON_WARNINGS=1 scripts/verify.sh build lint test size coverage
   types`, plus `npx node@22` / `npx node@24` for the affected suites). Push several fixes at
   once to save CI minutes.
5. Every run writes its log to `.logs/pre-beta/<area>/`. A test is "passed" only with a log.

## 2. Test environment matrix

The clean-room projects live outside the repository (`/tmp`-like scratch directories), so the
workspace never resolves anything for them.

| Axis | Values |
|---|---|
| Node.js | 22 (lowest supported), 24, 26 |
| Package manager | npm, pnpm, Yarn (berry, `nodeLinker: node-modules` and PnP), Bun |
| TypeScript (consumer) | 5.4, 5.9, 6.0, 7.0, 7.1-beta |
| Module system | ESM (`"type": "module"`), CommonJS |
| `moduleResolution` | `bundler`, `node16`, `nodenext` |
| Strict flags | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedDeclarations`, `noPropertyAccessFromIndexSignature` |
| Runtimes (clients) | Node.js, Bun, Deno, Chromium, Firefox, WebKit (all in CI today); a Workers-like runtime (`workerd`) is new |
| OS | macOS locally; Linux in CI; Windows only after the repository is public |

Not every combination: each section names the slice it needs. The full grid runs once, in §3.

## 3. Install from the beta tarballs (the tester's first 10 minutes)

Follow `RELEASE_NOTES.md` of `beta-1.0.0-beta.1` word by word, as a tester would.

- [ ] 3.1 `shasum -a 256 -c SHA256SUMS` passes for the downloaded assets.
- [ ] 3.2 Install with npm, pnpm and Yarn, using exactly the `overrides` / `resolutions`
      snippets from the notes. No openapi-typesafe package is looked up on npm. Bun has no
      snippet in the notes yet: find the working recipe and add it.
- [ ] 3.3 `npx openapi-typesafe --version` and `--help` work with each manager.
- [ ] 3.4 Every package imports in ESM and in CJS (`require`) where its `exports` map says so.
- [ ] 3.5 Types resolve for every `moduleResolution` value in §2: run
      [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
      and [`publint`](https://publint.dev) on each tarball (check the latest versions first).
- [ ] 3.6 Tarball contents: no tests, fixtures, source maps to missing files, `.logs`, or
      personal files; `LICENSE` and `README.md` present; `bin` files have a shebang and run.
- [ ] 3.7 `peerDependencies` ranges: install with the lowest and the highest allowed version
      (TypeScript for the generator, `@tanstack/react-query` `^5.80.0` for the React Query
      client); no peer warnings.
- [ ] 3.8 The migration path from the notes: `openapi-typesafe-migrate --write`, then replace
      `^1.0.0-beta.1` with the `file:` paths. Check that the notes are enough on their own.

## 4. Generator on real schemas

Inputs: the 7 example schemas in `packages/openapi-typesafe/examples/`, the compat corpus
(1,820 documents), and 10 large public APIs
picked by hand (GitHub, Stripe, DigitalOcean, Kubernetes, Cloudflare, Twilio, Slack, Jira,
Azure, AWS-style 3.1 documents).

- [ ] 4.1 Full compat run, all option sets, locally (from `tools/compat-harness`):
      `scripts/prepare-generators.sh`, `node src/cli/main.ts fetch --corpus all`, then
      `scripts/run-compat.sh all all`. Every difference from openapi-typescript 7.13 is
      classified: documented fix, or defect.
- [ ] 4.2 Generated output type-checks with every TypeScript version in §2 and every strict
      flag, for every option set (the type matrix covers a sample; extend it to the corpus).
- [ ] 4.3 Generated output has no `any` that the schema did not ask for, and is stable: two
      runs on the same input give the same bytes, also with a different key order in YAML.
- [ ] 4.4 OpenAPI versions: 3.0.x, 3.1.x (incl. `type` arrays, `const`, `$defs`,
      `unevaluatedProperties`, `prefixItems`, webhooks), 3.2 (the docs say "accepted": check
      which 3.2 features give correct types and document the rest), Swagger 2.0 (the docs say
      "not supported": check that the error says so).
- [ ] 4.5 Inputs: JSON, YAML (anchors, multi-document, BOM, CRLF, tabs), a URL, stdin, a
      `redocly.yaml` with several APIs, multi-file `$ref` (relative, absolute, URL, circular,
      to a JSON pointer with `~0`/`~1`/`%`).
- [ ] 4.6 Every CLI flag alone, and every pair that interacts (`--enum` × `--enum-values` ×
      `--dedupe-enums` × `--conditional-enums`; `--root-types` × its two modifiers;
      `--immutable` × `--read-write-markers`; `--export-type` × `--root-types`). Compare each
      with openapi-typescript 7.13.
- [ ] 4.7 `--check`: up to date, out of date, missing output; exit codes match `docs/cli.md`.
- [ ] 4.8 Performance: time and peak memory on the largest documents (GitHub, Stripe,
      Kubernetes), 5 runs each, median. Budget: at most 10% slower than openapi-typescript
      7.13 (users notice more than that in watch scripts and CI).
- [ ] 4.9 Paths: spaces, Unicode, symlinks, relative to `cwd` vs to the config file; output
      into a missing directory.

## 5. Node API

- [ ] 5.1 Every example in `docs/node.md` runs as written (copy-paste into a fresh project).
- [ ] 5.2 Every option of the Node API matches its CLI flag; unknown options are rejected or
      documented.
- [ ] 5.3 Input kinds: parsed object, YAML or JSON string, `URL` (file and remote), `Readable`
      stream; `transform` / `postTransform` callbacks; `astToString`.
- [ ] 5.4 Errors: each code of ADR-011 is reachable, typed, and has a useful message.
- [ ] 5.5 Concurrency: many parallel `openapiTS()` calls give the same output as sequential
      ones (no shared state between runs).

## 6. Fetch client (`openapi-typesafe-fetch`)

Against a real local server generated from a test schema, in every runtime of §2.

- [ ] 6.1 Every HTTP method; path parameters in every style (`simple`, `label`, `matrix`,
      with and without `explode`), query and header parameters. Cookie parameters are typed
      but not sent, as in openapi-fetch: check that the docs say so.
- [ ] 6.2 Query serialization: `form`/`spaceDelimited`/`pipeDelimited`/`deepObject`, `explode`
      true/false, arrays, nested objects, `null`/`undefined`, reserved characters, Unicode.
- [ ] 6.3 Bodies: JSON, `application/x-www-form-urlencoded`, `multipart/form-data` with files,
      `Blob`, `ArrayBuffer`, streams, custom `bodySerializer`.
- [ ] 6.4 Responses: JSON, text, empty (204 / `content-length: 0`), binary, stream,
      `parseAs` options; `data`/`error` narrowing by status in the types.
- [ ] 6.5 Errors: network failure, abort (`signal`), non-JSON error body, thrown middleware.
- [ ] 6.6 Middleware: order, `onRequest`/`onResponse`/`onError`, replacing the request,
      retry, auth refresh (the recipe in `docs/fetch/middleware-auth.md`).
- [ ] 6.7 Options: `baseUrl` with and without a trailing slash, custom `fetch`, `Request`
      subclass, default and per-call headers (merge and removal), `querySerializer` override.
- [ ] 6.8 Types: inference for every operation in the GitHub and Stripe schemas gives no
      `any` (type tests with `expectTypeOf`). Record the type-check time and instantiation
      count (`tsc --extendedDiagnostics`) against openapi-fetch 0.17 as the baseline.
- [ ] 6.9 Behaviour parity with openapi-fetch 0.17: same requests on the wire for the same
      calls, except the documented fixes of ADR-013.

## 7. React Query client (`openapi-typesafe-react-query`)

- [ ] 7.1 `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, `queryOptions`
      with React 18 and 19 and TanStack Query 5.80 (lowest allowed) and the latest 5.x.
- [ ] 7.2 Query keys: stable, unique per params, usable for `invalidateQueries`.
- [ ] 7.3 Server rendering and hydration (`renderToString` plus `HydrationBoundary`; there
      is no Next.js example yet), Suspense boundaries, error boundaries.
- [ ] 7.4 Types with `exactOptionalPropertyTypes` (ADR-009).
- [ ] 7.5 Every example in `docs/react-query/*` compiles and runs.

## 8. Migration tool (`openapi-typesafe-migrate`)

On real projects from `research/dependents.csv` (top 20 by stars or downloads), cloned fresh.

- [ ] 8.1 Dry run lists every change; `--write` applies exactly those.
- [ ] 8.2 After the migration the project installs, generates, type-checks and passes its own
      tests. Each failure is ours or documented in the migration guide.
- [ ] 8.3 Monorepos (pnpm, npm, Yarn workspaces), CJS `require`, dynamic `import()`, re-exports,
      type-only imports, scripts in `package.json`, `redocly.yaml`, CI files.
- [ ] 8.4 Running it twice changes nothing the second time; it never touches lockfiles or
      files outside `--root`. It does not check for uncommitted changes today: decide whether
      the guide should tell users to commit first, or the tool should warn.
- [ ] 8.5 `docs/migration-guide.md` steps work word by word.

## 9. Documentation and examples

- [ ] 9.1 Every code block in `docs/` and every `README.md` is either compiled by a test or
      checked by hand in a fresh project. List the ones not covered by tests.
- [ ] 9.2 Every CLI flag, option and error code in the code is documented, and every
      documented one exists.
- [ ] 9.3 The docs site (VitePress) builds, all links work, the local search finds the main
      topics, and it reads well on a phone.
- [ ] 9.4 `docs/typescript-7.md` claims are checked against the real TypeScript 7 releases.

## 10. Security (threat model)

Each threat in `docs/security/threat-model.md` gets one hostile input that proves the control.

- [ ] 10.1 Code injection through descriptions, names and enum values (`*/`, backticks,
      `${}`, Unicode line separators, `</script>`).
- [ ] 10.2 Prototype keys (`__proto__`, `constructor`, `prototype`) in schemas, paths and
      parameters, in the generator and in the clients' serializers.
- [ ] 10.3 Resource limits: deep nesting, huge documents, YAML alias bombs, long `$ref` chains,
      slow remote hosts.
- [ ] 10.4 `$ref` limits: `--local-ref-root` escape attempts (`..`, symlinks, `file://`,
      encoded paths), `--remote-ref-hosts` bypass attempts (redirects, userinfo, IPv6,
      uppercase hosts, trailing dots).
- [ ] 10.5 Supply chain: `pnpm audit`, licenses of all production dependencies, no install
      scripts in our packages.

## 11. Agent skill

- [ ] 11.1 CI runs only `validate` (the reference solutions). Run
      `pnpm --filter @openapi-typesafe/skill-evals eval` once with a real agent; it needs an
      API key and costs money, so agree the budget first.
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
| | | | | |

## 14. Exit criteria (before inviting testers)

- All S1 and S2 findings fixed; S3 findings fixed or filed as issues with a reason.
- §3 passes with every package manager on Node.js 22 and 26.
- §4.1 compat report: ≥ 99% byte match, 100% type identity, every difference classified.
- `1.0.0-beta.2` packed from the fixed `main` and the private release updated.
