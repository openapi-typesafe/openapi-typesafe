# Phase 8.4: real dependent projects

`pnpm harness dependents` runs 22 open-source projects (15 at first, 7 added before the beta) twice from a pinned commit:

- **baseline**: the original packages pinned to the fork-base releases
  (openapi-typescript 7.13.0, openapi-fetch 0.17.0, openapi-react-query 0.5.4,
  openapi-typescript-helpers 0.1.0);
- **candidate**: the same tree switched to the packed openapi-typesafe tarballs by package name
  only (dependencies, module specifiers and the `openapi-typescript` command in scripts).

Run on 2026-11-02 with Node.js 24: **15 passed, 0 regressed, 0 failed before the switch.**
All 12 generated files are byte-identical after the product name in the header is normalized.

## Projects left out or narrowed

| Project | Decision | Reason |
| --- | --- | --- |
| tolgee-cli | left out | Fails on the baseline: openapi-fetch 0.17.0 gives TS2589 and implicit `any` where the project pins 0.13.1. An upstream breaking change, not ours. |
| extract | left out | Its `tsc` script is broken at the pinned commit. |
| swr-openapi | typecheck only | Its lockfile pairs a vitest and vite that do not run together. |
| permit-cli | typecheck only | Its Ink UI tests are flaky on both variants. |
| immich-discord-bot | one spec excluded | The RSS spec needs the macOS-only address 127.0.0.2. |
| arena-cli | explicit test list | `registry.test.ts` calls a live API. |
| openapi-msw | left out | `devEngines` pins Node.js 24.22.1 and npm 11.19.1 exactly; install fails on any other version (`EBADDEVENGINES`). |
| coderabbit-bitbucket, rootly-ts | no generate step | They download the spec from the network; bitbucket's tests call a live server. |
| vitrina-api | no generate step | It generates through the Node API from a spec outside the repository; the committed types are used. |
| forge-dashboard-sdk | no contract tests | They need Prism in Docker. |
| ai-dial-sdk | no docs site build | It needs a separate install. |

No project in the list uses Yarn: the harness runs npm, pnpm and Bun projects only.

## Environment

Node.js 26 deprecates `module.register` (DEP0205) and enables Web Storage by default; both break
several projects' own tests on the baseline. The run uses Node.js 24 first on `PATH`. Bun
projects need `bun` on `PATH`. Commands run with `CI=1`, `LANG=en_US.UTF-8` and `TZ=UTC`.

## With the migration tool (ENGINEERING_PLAN 10.1)

`pnpm harness dependents --switch migrate` makes the candidate switch with
`openapi-typesafe-migrate --write`, as a user runs it, and then points the new packages at the
packed tarballs. The baseline is unchanged.

Run on 2026-11-02 with Node.js 24: **15 passed, 0 regressed, 0 failed before the switch.** All
12 generated files are byte-identical after the header is normalized.

Pre-beta re-run (test plan §8) on 2026-11-02 with the migration tool from that day: the 15
projects passed again, and 7 new ones (coderabbit-bitbucket, vitrina-api, rootly-ts, ai-dial-sdk,
sendly-js, forge-dashboard-sdk, openapi-axios) passed too: **22 passed, 0 regressed**, and every
generated file is identical after the header is normalized.

Over the first 15 projects the tool made 35 dependency renames, 55 module specifier renames and 14
command renames, and reported 3 renamed peer dependencies (correct: those packages' users must
switch too).

The first run found two faults, both fixed before the run above:

| Fault | Fix |
|---|---|
| `pnpm-lock.yaml` was read as a CI file, so lock entries such as `openapi-typescript@7.13.0` were reported as pinned commands (12 false manual steps; nothing was written) | Lockfiles are skipped: the install writes them again |
| org-roam-ui-lite passes `transform: customTransform`, a module-level arrow function with a declared `import("typescript").TypeNode` return type; the tool only knew inline functions | A transform named by a module function (or function declaration) is followed, and a declared return type is removed, since it names TypeScript nodes. A function also used elsewhere in the file is left and reported |

After the fix the org-roam-ui-lite transform is rewritten to return `"Uint8Array"` with
`irCallbacks: true`; its generated `api.d.ts` is identical to the baseline's, and its type check
and tests pass.
