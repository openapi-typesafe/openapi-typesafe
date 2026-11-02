# ADR-018: Keep the `./*` export of the upstream packages in 1.x

- Status: Accepted
- Date: 2026-11-02

## Context

openapi-typescript, openapi-fetch and openapi-react-query publish `"./*": "./*"` (the generator:
`"./*.js": "./*.mjs"` and `"./*"`) next to the `.` entry, so any file in the package can be
imported by its path. Our packages keep this from the fork base.

publint 0.3.25 warns about it in `openapi-typesafe` and `openapi-typesafe-fetch`: through the
wildcard an ESM file can import a built `.cjs` file that sets both `exports.__esModule` and
`exports.default`, and some bundlers then get the wrong default export. The `.` entry, which the
docs use, is not affected; `attw` finds no problems in any package.

## Decision

1. The `./*` exports stay as they are in 1.x.
2. `scripts/check-exports.sh` runs publint on every packed package and fails on publint errors.
   The `./*` warning above is the only accepted warning; any other publint warning is fixed.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Keep `./*` (chosen) | Deep imports that work with the upstream packages keep working after the migration | publint warns; a deep import of a `.cjs` file from ESM can get the wrong default |
| Remove `./*` | publint passes; a smaller public surface | Breaks every deep import, which the migration promises to keep working; a breaking change for 1.0 of a drop-in replacement |
| List the deep paths that users import | Smaller surface, no warning | We do not know these paths; `research/node-api-usage.md` covers the Node API, not file paths |

## Consequences

- Upgrading from upstream keeps deep imports working.
- Deep imports stay outside the documented API; the migration tool reports them as manual steps.
- The publint check in CI cannot tell this warning from a new one at the warning level, so it runs
  at the error level, and this ADR lists the one known warning.

## Review trigger

Version 2.0, or a user report of a wrong default export through a deep import.
