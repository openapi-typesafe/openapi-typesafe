# ADR-016: One version line for the published packages

- Status: Accepted
- Date: 2026-11-02

## Context

The migration tool renames `openapi-typescript`, `openapi-fetch`, `openapi-react-query` and
`openapi-typescript-helpers` in a project's `package.json` and pnpm catalogs, and must write a
version for each new package. It is a command run once with `npx`; it must not ask a registry
(offline and private-registry projects) and must not guess.

With independent versions, the tool would need the current version of four other packages built in,
and they would go stale whenever one of them is released without the tool. The packages already
move together: `openapi-typesafe-fetch` and `openapi-typesafe-react-query` depend on
`openapi-typesafe-helpers`, and a generator change usually needs a matching helpers release.

## Decision

`openapi-typesafe`, `openapi-typesafe-fetch`, `openapi-typesafe-react-query`,
`openapi-typesafe-helpers` and `openapi-typesafe-migrate` form one Changesets `fixed` group: every
release gives all five the same version. The migration tool writes its own version for the renamed
packages.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| One `fixed` group (chosen) | The tool's version is always right; one number to tell users and testers | A package without changes gets a new version |
| Independent versions, built into the tool at build time | Versions only move when a package changes | Stale as soon as another package is released alone |
| Ask the registry at run time | Always current | Network at run time; fails offline and behind private registries |
| Write `latest` | Simple | Not reproducible; a lockfile hides the range the user really has |

## Consequences

- The release notes of an unchanged package say only that its version moved.
- A breaking change in one package makes a major release of all five.

## Review trigger

One package needs a release cadence of its own (for example, a client that follows a framework's
major versions), or users report the empty releases as noise.
