# ADR-035: Dev-only advisories we accept

- Status: Accepted
- Date: 2026-11-07

## Context

Audit B3 (supply chain, 2026-11-07) listed 12 open Dependabot alerts. None is in a package that a
published tarball depends on: `pnpm licenses list --prod` and `pnpm why` show each one only under
the `devDependencies` of the monorepo root, the docs site or the private SvelteKit example, and
the tarballs bundle nothing from `node_modules`. Dependabot calls most of them `runtime` only
because it cannot see that `docs/` is a private package.

Eleven have a patched version that the dependents do not ask for yet. pnpm overrides in
`pnpm-workspace.yaml` now install it; `pnpm --filter openapi-typesafe-docs build-docs` and
`check-links` pass with them, without warnings:

| Alerts | Package | Override | Why the dependent does not move |
|---|---|---|---|
| 8 vite advisories, 1 esbuild advisory | vite 5.4.21, esbuild 0.21.5 | `vitepress>vite: ^6.4.5` (esbuild 0.25.12 with it) | VitePress 1.6.4, its latest stable release, wants `vite ^5.4.14`; VitePress 2 is still alpha. `@vitejs/plugin-vue` 5.2.4 accepts vite 6. |
| GHSA-3g3m-2fjr-6pw4 | glob 13.0.6 | `linkinator>glob: ^14.0.4` | linkinator 8.1.0 (latest) wants `glob ^13`. |
| GHSA-g3hv-75wg-m249 | minimatch 10.2.6 | `minimatch@>=7 <11.0.1: ^11.0.5` | glob 13 and vitepress-plugin-llms 1.14.0 (latest) want `minimatch ^10`. The generator's minimatch 5.1.9 is outside the advisory range and is not touched. |

One alert has no fix:

| Alert | Package | Severity | Paths |
|---|---|---|---|
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge 4.3.1 (`>=4.2.0 <=4.3.1`, no patched version; no deepmerge release since 2023) | low | `unbuild` → `@rollup/plugin-node-resolve`; the SvelteKit example → `@sveltejs/vite-plugin-svelte` |

## Decision

1. The three overrides above stay until the dependent asks for a patched version on its own; then
   the override is removed.
2. GHSA-gcqx-w48m-w2h4 is accepted as a tolerable risk. `osv-scanner.toml` lists it with this
   reason, so the OSV scan of Scorecard skips it; the Dependabot alert is dismissed as "risk is
   tolerable" with a link to this ADR.

Why deepmerge cannot reach users or CI secrets:

- **Users.** It is in no production dependency tree of the five published packages, and nothing is
  bundled into their `dist`.
- **CI.** The advisory needs attacker-controlled objects merged into a configuration. Here
  `@rollup/plugin-node-resolve` merges the build configuration of this repository, and
  vite-plugin-svelte merges the Svelte configuration of our own example. Both are files in this
  repository that pass review. The jobs that run them hold no secrets: no secret exists in the
  repository, and since the release split (ADR-007, amendment of 2026-11-07) the job that builds
  the tarballs has no publishing right.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Overrides, and accept deepmerge (chosen) | 11 of 12 alerts fixed now with stable versions; the docs build proves the vite 6 override | Overrides to remove later; one alert stays |
| VitePress `2.0.0-alpha.21` instead of the vite override | No override | An alpha in the toolchain, against the stable-versions rule (CODING_PRINCIPLES 7.10) |
| Dismiss everything as dev-only | No change | Known fixes left out; the high vite advisory stays installed |
| Override deepmerge to a fork | Alert closed | An unreviewed fork in the build of every tarball, for a low advisory that the build cannot trigger |
| Replace unbuild now (backlog item 31) | Removes the main deepmerge path | The candidates (`obuild`, `tsdown`) are before 1.0; a build tool change needs its own ADR and checks of every tarball, not part of a security fix |

## Consequences

- `pnpm audit` reports one low advisory (deepmerge) instead of 12.
- The overrides run vite 6 under VitePress 1.6.4, a combination VitePress does not declare. The
  `docs (build, links)` job shows when it breaks.

## Review trigger

A deepmerge release with a fix; unbuild replaced (backlog item 31) and SvelteKit without
deepmerge; deepmerge in a production dependency tree; a new advisory for deepmerge; or a release of
VitePress 2.0.0, linkinator or vitepress-plugin-llms that asks for the patched versions (then drop
its override).
