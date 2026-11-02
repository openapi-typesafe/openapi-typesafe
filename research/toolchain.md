# Toolchain review (task 1.5)

Checked against the npm registry on 2026-11-02. Each update landed in its own commit, followed by a full
`pnpm verify` run (build, lint, test, size) with zero errors and zero warnings.

## Development tools

| Tool | Before | After | Notes |
|---|---|---|---|
| pnpm | 10.30.3 | **12.16.1** | `onlyBuiltDependencies` / `ignoredBuiltDependencies` replaced by `allowBuilds`; `minimumReleaseAge: 1440` made explicit; lockfile re-resolved under that policy |
| turbo | 2.9.9 | 2.11.10 | |
| @biomejs/biome | 2.4.14 | 2.6.4 | Config migrated (`preset` instead of the deprecated `recommended` flag) |
| vitest, @vitest/coverage-v8 | 4.1.11 (coverage new) | **5.0.5** | `vitest.workspace.ts` → root `vitest.config.ts` with `projects`; benchmarks moved to the `bench` fixture |
| @changesets/cli | 2.31.1 | **3.0.3** | Schema URL updated to `@changesets/config@4.0.1` |
| @changesets/changelog-github | 0.7.0 | **1.0.1** | |
| size-limit, @size-limit/preset-small-lib | 12.1.0 | **14.3.0** | Measures with rolldown: fetch client 7.2 kB → 7.41 kB for the same code |
| @playwright/test | 1.59.1 | 1.64.1 | |
| prettier | 3.8.3 | 3.9.10 | Used only by docs tooling |
| @types/node | 25.9.8 | 22.20.5 | Matches the lowest supported Node (`engines >= 22`) so newer Node APIs cannot slip in |
| vite (catalog) | ^7.3.1 | **^8.3.5** | |
| execa (catalog) | ^9.6.1 | **^10.2.1** | |
| vite-node | 5.3.0 | **6.0.0** | |
| @vitejs/plugin-react | 5.2.0 | **6.1.2** | |
| jsdom | undeclared (20.0.3 via peer) | 30.1.3 | Declared in react-query, which uses it as test environment |
| unbuild | 3.6.1 | 3.6.1 (latest) | Last release 2025-08-15. Kept: works with zero warnings; the alternative `tsdown` is pre-1.0 (0.23.4). Review trigger: a build defect without an upstream fix, or tsdown 1.0 |
| @arethetypeswrong/cli | 0.18.5 | 0.18.5 (latest) | Pins `typescript@5.6.1-rc` internally |
| typescript (workspace) | 5.9.3 | 5.9.3 | Latest 5.x. Development compiler stays on 5.x until Phase 6 removes the compiler API; TS 6 / 7 are test targets (ADR-006) |
| linkinator (docs) | — | 8.1.0 | Added in Phase 10.2 for the docs link check (links, anchors); repository links are checked against the working tree by `docs/scripts/check-repository-links.mjs` while the repository is private |
| react-dom (react-query) | undeclared (picked by peer) | 18.3.1 | Declared in react-query: `@testing-library/react` needs it, and without the declaration pnpm resolved it to 19.x next to React 18 |
| vitepress-plugin-llms (docs) | — | 1.14.0 | Added in Phase 10.5: `llms.txt`, `llms-full.txt` and a Markdown copy of every page |
| skill-evals: React, TanStack Query | — | react 18.3.1, @tanstack/react-query 5.100.9 | Not the latest (19.3.1, 5.105.x) on purpose: the linked `openapi-typesafe-react-query` resolves its own copies of these packages, and two copies in one type check do not match. Updated together with the react-query package |

Not yet added (added by the task that needs them, at the then-current version): dependency-cruiser (18.7.1),
commitlint (21.2.4), lefthook (2.2.2), fast-check (4.10.2), tsdown (not adopted).

## Generator runtime dependencies

| Package | Range before | Range after | Latest | Notes |
|---|---|---|---|---|
| @redocly/openapi-core | ^1.34.6 | ^1.34.6 (resolves 1.34.22) | 2.72.1 | 2.x is a major change of the loader; decided with corpus data in ADR-005 |
| ansi-colors | ^4.1.3 | unchanged | 4.1.3 (2023) | Removal candidate (`util.styleText`), §9 |
| change-case | ^5.4.4 | unchanged | 5.4.4 | |
| parse-json | ^8.3.0 | unchanged | 8.3.0 | |
| scule | ^1.3.0 | unchanged | 1.3.0 (2024) | Overlaps with change-case, §9 |
| supports-color | ^10.2.2 | **^11.0.0** | 11.0.0 | Requires Node >= 22 |
| yargs-parser | ^21.1.1 | **^22.0.0** | 22.0.0 | Removal candidate (`util.parseArgs`), §9 |

## Example apps (not published)

SvelteKit example: @sveltejs/kit ^2.70.3, @sveltejs/vite-plugin-svelte ^7.3.1, svelte ^5.57.3.
Vue example: @vitejs/plugin-vue ^6.0.10, vue ^3.5.44. Both build with vite 8 without warnings. The Next.js example
stays on Next 15 (Next 16 is a major upgrade of a demo app; it is reviewed with the docs in Phase 10).

## Remaining notices

- `vitepress` 1.6.4 (latest stable; 2.0 is alpha) pulls in deprecated `@ungap/structured-clone`. Rechecked in
  Phase 10.2: 2.0 is still alpha (2.0.0-alpha.21), so the site stays on 1.6.4.
