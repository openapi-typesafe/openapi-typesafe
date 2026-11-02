# ADR-003: Dependency policy and initial dependency review

- Status: Accepted
- Date: 2026-11-02

## Context

The upstream maintainer declined to hand over the packages partly because of npm supply-chain attacks
(shai-hulud). A successor must make dependency risk visible and small. Every runtime dependency of the generator
runs on developer machines and in CI with access to source code and secrets.

## Decision

1. **Runtime dependencies.** `openapi-typesafe-fetch` targets zero runtime dependencies (today: only
   `openapi-typesafe-helpers`, a types-only package). The generator may depend only on packages that are necessary,
   actively maintained (a release or a maintainer response within the last 12 months, or feature-complete and
   small), and small. Each runtime dependency is listed below or in a later ADR.
2. **Versions.** Before adding or updating any dependency, check the current stable version in the registry
   (CODING_PRINCIPLES §7.10). Development tools are pinned exactly; library ranges are caret ranges; the lockfile is
   committed.
3. **Install policy.** pnpm runs with `minimumReleaseAge: 1440` (no version younger than 24 hours) and an explicit
   `allowBuilds` list; every other dependency build script is blocked.
4. **Majors** are updated in separate commits with the full quality gate (`pnpm verify`).
5. **No new runtime dependency** without an ADR.

## Initial review (generator runtime dependencies)

| Package | Purpose | Decision |
|---|---|---|
| `@redocly/openapi-core` (1.34.x) | Load, bundle and resolve `$ref` | Keep for now; 2.x and alternatives are evaluated with corpus data in ADR-005 |
| `ansi-colors` | Terminal colors | Keep; removal candidate, Node ≥ 22 has `util.styleText` (Phase 7, only if CLI output stays identical) |
| `supports-color` (11.x) | Color detection | Keep; removed together with `ansi-colors` if `util.styleText` covers detection |
| `change-case` | Identifier casing | Keep; overlaps with `scule`, merge is evaluated in Phase 7 |
| `scule` | Identifier casing (CLI and root types) | Keep; see `change-case` |
| `parse-json` | JSON parsing with readable errors | Keep; removal candidate if error messages can be reproduced |
| `yargs-parser` (22.x) | CLI argument parsing | Keep; removal candidate, Node has `util.parseArgs` (Phase 7, only if every flag, alias and error stays identical) |
| `typescript` (peer `^5.x`) | Compiler API used to build output | Removed from runtime in Phase 6 (ADR-002); stays an optional peer only for the legacy bridge (ADR-004) |

Development tools and their versions are recorded in [`research/toolchain.md`](../research/toolchain.md).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Explicit policy with per-dependency review (chosen) | Risk is visible and reviewable; fewer surprises | Some review work for each change |
| Bundle all dependencies into the published file | No install-time resolution | Hides what users run; slower security updates; larger package |
| No policy | No overhead | Dependency count and risk grow unnoticed |

## Consequences

- Removing dependencies is planned work with a compatibility requirement, not an opportunistic cleanup.
- A slower adoption of fresh releases (24 hours) is accepted in exchange for protection against short-lived
  malicious versions.

## Review trigger

A dependency becomes unmaintained or deprecated, a security advisory affects one of them, or npm changes its
provenance or publishing model.
