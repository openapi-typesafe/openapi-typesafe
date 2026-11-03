# Roadmap plan: features and fixes while the beta runs

> The work we do ourselves while the closed beta runs, ordered by user demand (thumbs-up on the
> upstream issues, `research/backlog.md` §5). Every item keeps the drop-in promise: the default
> output of an existing schema does not change, unless the change only fixes output that does
> not compile.

**Status:** not started. **Logs:** `.logs/roadmap/<step>/`.

## 1. Order

| Step | Item | Backlog | Demand | Effort | Output change | Ships as |
|---|---|---|---:|---|---|---|
| R1 | `format: binary` as `Blob` (file upload) | 16 | 48 | M | Valid output → opt-in | `--binary-as-blob` |
| R2 | OpenAPI 3.2 baseline: `query`, `additionalOperations`, `itemSchema`, `in: querystring` | 17 | 36 | M–L | Only adds types to 3.2 documents | default for 3.2 |
| R3 | Optional properties and parameters with `default` | 25 | 21 | M | Valid output → opt-in, or a documented "won't do" | decided in R3.1 |
| R4 | Workspace on TypeScript 6 (unblocks SvelteKit 3) | — | — | M | None (tooling) | — |
| R5 | How opt-in output fixes are exposed (ADR) | — | — | S | None | ADR |
| R6 | `allOf` member with only `required` | 18 | 13 | M | Valid output → opt-in | per R5 |
| R7 | react-query type fixes | 23 | 4 | M | Client types; stricter ones opt-in | per ADR |
| R8 | `anyOf` with sibling `properties` → intersection | 19 | 3 | S | Valid output → opt-in | per R5 |
| R9 | `--array-length` tuple bugs | 21 | 3 | S | Valid output → opt-in | per R5 |
| R10 | Invalid-output fixes: `--enum` member collisions, `--path-params-as-types` index signatures, `--exclude-deprecated` dangling refs | 27, 28, 29 | 0 | S–M | Only output that does not compile | default fix |
| R11 | `unevaluatedProperties` | 22 | 0 | M | Valid output → opt-in | per R5 |
| R12 | Discriminator value conflict | 26 | 0 | S | Valid output → opt-in | per R5 |
| R13 | Numbered root-type aliases for case-only clashes | 30 | 0 | S | Valid output → opt-in | per R5 |

## 2. Decisions made with this plan

Setting this plan as the goal approves these decisions. A step that finds one of them wrong stops
and asks.

1. **Where the work lands.** Each step is a short branch merged into `main` when its gates (§4)
   pass. Default output stays byte-identical, so `main` stays releasable. Whatever is done before
   `changeset pre enter rc` ships in 1.0; that moment is the feature freeze, and the remaining
   steps continue for 1.1. Entering rc needs the maintainer's "yes" (LAUNCH_CHECKLIST), so this
   plan never does it.
2. **New beta.** After R3, if a tester is active or the step list reaches R4, pack
   `1.0.0-beta.4` with `scripts/release/pack-beta.sh` and update the private GitHub release
   (approved earlier; tell the maintainer). Its notes list the new opt-ins.
3. **OpenAPI 3.2 (R2) is on by default for 3.2 documents.** Today these parts are left out of the
   output with a warning (`unsupported-features.ts`), and openapi-typescript 7.13 leaves them out
   too. Adding them only adds types to 3.2 documents; 3.0 and 3.1 output does not change. An ADR
   records this.
4. **R1 follows upstream PR #2878**: the same flag name and Node option (`binaryAsBlob`), so users
   who know the PR find it. Its author is credited in the changeset.
5. **Beta reports come first.** Before each step, check the inbox of fedorstartup@gmail.com
   (Gmail connector) for tester replies:
   - "yes" from someone in the group A table of the launch log: give that GitHub login read
     access (`gh api -X PUT repos/openapi-typesafe/openapi-typesafe/collaborators/<login> -f
     permission=pull`) and record it;
   - a bug report: triage it as a beta finding, fix it before the current step;
   - anything else: report it to the maintainer, do not answer it.

## 3. Not allowed in this plan

- Making the repository public, publishing to npm, entering rc, publishing the skill, deleting
  `openapi-typesafe-old`, posting in upstream issues, sending email. Each needs the maintainer.
- Installing system software. `npx`, `pnpm dlx` and the repo's own tools are fine.
- Pushing often: push once per finished step (or a batch of small ones), after the local gates.
- Changing the default output of a valid schema without an ADR and the maintainer's "yes".

## 4. Definition of done for every step

1. **Research.** Read the upstream issues and PRs of the item; write
   `research/roadmap/<step>.md`: the problem with a minimal schema, the design, the cases it
   covers and the ones it leaves out, and how it combines with the other flags.
2. **ADR** when the step adds a flag family, changes a default, or makes a contract decision.
3. **Tests first.** A failing test per case at the lowest level that shows it, then the fix.
   In-memory fakes, no mocks. Coverage stays ≥ 90% (the gates enforce it).
4. **Every place an option lives:**
   - `src/types/generator-options.ts` (Node API, with TSDoc), `src/api/document-run.ts`,
     `src/cli/cli-arguments.ts`, `src/cli/help-text.ts`;
   - `docs/cli.md`, `docs/node.md`, and a "New options" section under "What is different" in
     `docs/migration-guide.md` (the first step adds the section);
   - `skills/openapi-typesafe/references/generator.md`;
   - `tools/compat-harness/src/domain/option-matrix.ts` (a new option set, alone and with the
     flags it interacts with).
5. **Gates, all green locally:**
   - `VERIFY_FAIL_ON_WARNINGS=1 scripts/verify.sh build lint test size coverage types skills`;
   - compat on the 200-document subset with all option sets: every existing option set stays
     identical to `fork-base` (0 mismatches);
   - the new option set on the full corpus: every output compiles under strict settings, or has
     no more errors than the output without the flag (record the counts);
   - the type matrix (TypeScript 5.4, 5.9, 6.0, 7.0, 7.1 beta) passes with the new flag on the
     example schemas.
6. **Changeset** (`minor` for a new option, `patch` for a fix), written for users.
7. **Commits** in Conventional Commits, one logical change each; push after the step; CI green.
8. **Record:** tick the step here, add its row to §6, add a line to the launch log.

## 5. Steps

### R1. `--binary-as-blob` (backlog 16; upstream #1214, PR #2878)

- [x] R1.1 Research: #1214 and its duplicates, PR #2878. Cases: OpenAPI 3.0 `type: string,
  format: binary`; 3.1 `contentMediaType` without `contentEncoding`; `format: byte` and
  `contentEncoding: base64` stay `string`; textual media types (`text/*`, JSON, XML) stay
  `string`; binary inside `multipart/form-data` objects, in arrays, in `oneOf`, in parameters and
  in responses.
- [x] R1.2 `Blob` needs a global type: it exists in the DOM lib and in `@types/node`. Check the
  output under `lib: ["es2022"]` with neither, and document what the user needs. Decide whether
  the flag also accepts `File` (it extends `Blob`, so `Blob` is enough for uploads).
- [x] R1.3 Implement in the schema transform, with `--immutable`, `--read-write-markers` and
  `--array-length`.
- [x] R1.4 Client: `openapi-typesafe-fetch` sends a `Blob` in a `multipart/form-data` body
  (`FormData` serializer) and types it; a binary response is read with `parseAs: "blob"`. Add a
  runtime test and a browser e2e upload test.
- [x] R1.5 Gates of §4; docs show an upload example.

### R2. OpenAPI 3.2 baseline (backlog 17; upstream #2577, PRs #2683, #2853, #2844)

- [x] R2.1 Research: the 3.2 changes that affect types (`query` operations,
  `additionalOperations`, `itemSchema` for streamed media types, `in: querystring`, and any other
  type-relevant change in the 3.2 changelog). One design note covers all four.
- [x] R2.2 ADR: on by default for 3.2 documents (§2.3); how `itemSchema` sits next to `schema`
  (both types are kept; upstream PR #2683 replaced `schema`, which loses the complete-payload
  type); where `querystring` goes in `parameters`.
- [x] R2.3 Generator: emit each part; remove its warning from `unsupported-features.ts` (keep the
  warning for anything still left out).
- [x] R2.4 Clients: `QUERY` in `openapi-typesafe-helpers` (`HttpMethod`), `openapi-typesafe-fetch`
  (`client.QUERY`, with a body) and `openapi-typesafe-react-query`; a custom method from
  `additionalOperations` through a typed `request(method, …)` if the design keeps it simple,
  otherwise documented as not supported.
- [x] R2.5 Gates of §4; the 3 curated 3.2 documents gain types and lose no type; 3.0 and 3.1
  output byte-identical.

### R3. Properties and parameters with `default` (backlog 25; upstream #2012, #2319, #1957, #1903)

- [x] R3.1 Research and decide. Today a property with `default` is required unless it sits in a
  request body or parameter path (`INPUT_PATH_PARTS` in `object-type.ts`), and
  `--default-non-nullable=false` makes them all optional. Reproduce each issue: which ones are
  already solved by these two rules, and which need one shared component schema to be optional
  in requests and required in responses. Compare designs: a flag that treats `default` as
  optional in every component; reuse of the read/write split of `--read-write-markers`; separate
  request and response component types.
- [x] R3.2 If a design keeps the output simple and correct, ADR + implement + gates. If none
  does, write the reasoning in the design note, document the existing options in `docs/cli.md`
  as the answer, and close the step as "won't do".

### R4. Workspace on TypeScript 6

- [x] R4.1 Research: what still pins the workspace compiler to 5.9 (`research/toolchain.md`,
  ADR-006, compiler-API users: the type checks in the harness, the type matrix, legacy callbacks).
- [x] R4.2 Move the catalog `typescript` to 6.x; fix every error and warning; the consumer matrix
  still covers 5.4 to 7.1.
- [x] R4.3 SvelteKit 3 and adapter-auto 8 in the example; drop their two ignore rules from
  `.github/dependabot.yml`; update `research/toolchain.md` and ADR-006.

### R5. How opt-in output fixes are exposed (ADR)

- [x] R5.1 Six fixes below change valid output. One flag each would grow `--help` by six flags
  that mean "fix this bug". Compare: one flag per fix; one option with a list
  (`--fix allof-required,anyof-properties` and `--fix all`); and how each choice flips to the
  default in 2.0. Write the ADR, then use it in R6, R8, R9, R11, R12 and R13.

### R6. `allOf` member with only `required` (backlog 18; #1474, #1520, #2165, #2850, #2858)

- [ ] R6.1 Research and design: a member `{ required: [...] }` with no properties should make the
  named properties of the other members required, instead of adding `Record<string, never>`.
- [ ] R6.2 Implement behind the R5 mechanism; gates of §4.

### R7. react-query type fixes (backlog 23)

- [ ] R7.1 Go through #2852, #2873, #2882, #2184, #2671, #2715, #2826, #2340, #2642, #2857, #2864,
  #2865 and their PRs. Split: pure type fixes that accept all code that compiles today (default);
  stricter types that can break compiling code (#2857, #2865: opt-in or a note for 2.0, ADR).
- [ ] R7.2 Implement with type tests (`expectTypeOf`) and runtime tests; gates of §4.

### R8. `anyOf` with sibling `properties` (backlog 19; #2380, #2608)

- [ ] R8.1 Intersection of the sibling object with the `anyOf` union, behind R5; gates of §4.

### R9. `--array-length` tuples (backlog 21; #2048, #2330, #2546)

- [ ] R9.1 `minItems: 1`, nested arrays, `minItems..maxItems` ranges; behind R5 (the flag already
  exists, so the fix changes the output of its users); gates of §4.

### R10. Invalid-output fixes (backlog 27, 28, 29)

- [ ] R10.1 `--enum`: members that differ only in dropped characters get numbered names, as
  `ApiPaths` does (PB-38).
- [ ] R10.2 `--path-params-as-types`: literal paths that a template-literal path key also
  matches; design first (an index signature cannot hold differently typed literal keys).
- [ ] R10.3 `--exclude-deprecated`: keep a deprecated schema that a kept operation still
  references.
- [ ] R10.4 Each as a default fix: the compat report must show the affected cases as
  golden-invalid with fewer errors; add them to `docs/compatibility.md`.

### R11–R13. `unevaluatedProperties`, discriminator conflict, numbered root aliases

- [ ] R11 `unevaluatedProperties` (backlog 22; #2839, #2880), behind R5.
- [ ] R12 Discriminator value conflict (backlog 26), behind R5.
- [ ] R13 Numbered aliases for case-only root-type clashes (backlog 30, PB-47), behind R5.

## 6. Results

| Step | Date | Commits | Result |
|---|---|---|---|
| R1 | 2026-11-03 | `693f59b2`..`b87c3599` | `--binary-as-blob`; `Readable`/`Writable` keep functions; multipart object bodies as `FormData`; harness checks opt-in flags. Opt-in: 7,280 cases, 0 regressions; compat 200 × 28: 0 mismatches; type matrix pass. See `research/roadmap/R1.md` |
| R2 | 2026-11-03 | see `git log --grep "3.2"` | OpenAPI 3.2 typed by default (ADR-020): `query`, `additionalOperations`, `itemContent`, `querystring`, `components.mediaTypes`; `QUERY` in the clients. Full corpus × 28 sets: 3.0/3.1 byte-identical; 3.2 documents gain types, lose none. See `research/roadmap/R2.md` |
| R3 | 2026-11-03 | `docs(cli)` commit | Won't do: `default` does not promise the field is sent, so the correct type is optional, which `--default-non-nullable=false` already gives; a marker or split types encode a wrong assumption. Documented in `docs/cli.md#defaultnonnullable` and the skill. See `research/roadmap/R3.md` |
| R4 | 2026-11-03 | `build(deps)` and `chore(examples)` commits | Workspace compiler on TypeScript 6 (not 7: no JavaScript compiler API for `unbuild` and the legacy bridge); `dist` byte-identical; SvelteKit 3 example; two Dependabot ignores dropped; ADR-006 decision 4 updated. See `research/roadmap/R4.md` |
| R5 | 2026-11-03 | `docs(adr)` commit | ADR-021: one `fix` option with named fixes (`--fix allof-required,…`, `--fix all`), unknown names fail, `redocly.yaml` per API replaces the CLI list, every fix becomes the default in 2.0. See `research/roadmap/R5.md` |

## 7. Exit criteria

- Every step is done or closed with a written reason.
- `main` is green; the full compat run shows 0 mismatches for the existing option sets, and the
  compatibility report lists every new default fix.
- The docs, the skill reference and the migration guide describe every new option.
