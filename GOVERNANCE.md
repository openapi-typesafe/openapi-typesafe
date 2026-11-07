# Governance

This document describes how decisions are made in openapi-typesafe.

## Roles

- **Lead.** Owns the GitHub organization, npm packages, release process and security response. Sets direction,
  breaks ties, and is accountable for releases. Current Lead: see [MAINTAINERS.md](./MAINTAINERS.md).
- **Maintainer.** Reviews and merges pull requests, triages issues, and may cut releases. Invited by the Lead after
  sustained, high-quality contributions (reviews, fixes, issue triage) over at least three months.
- **Contributor.** Anyone who opens an issue, a discussion or a pull request.

The project has a single maintainer. Recruiting a co-maintainer is an open goal, so that no release or security fix
depends on one person.

## Scope

The project turns OpenAPI 3.x documents into TypeScript types and provides type-safe clients for them.
For 1.x the scope is the inherited feature set plus fixes; new features follow the ranked backlog
([research/backlog.md](./research/backlog.md)). Swagger 2.0 input, runtime validation and server frameworks are
out of scope.

## Decisions

- **Day-to-day changes** are decided in pull request review.
- **Systemic decisions** (architecture, dependencies, supported versions, release process, breaking changes) are
  recorded as Architecture Decision Records in [`adr/`](./adr). An ADR states the context, the decision, the
  alternatives with trade-offs, the consequences and a review trigger.
- When maintainers disagree, the Lead decides after hearing all arguments, and the reasoning is written down in the
  pull request or ADR.

## Code review and merging

1. `main` is always green: every required CI check passes before merge.
2. Pull requests from contributors need approval from a maintainer.
3. Once there are two or more maintainers, every pull request, including the Lead's, needs one approval from
   another maintainer. Until then, the Lead may merge their own work after CI passes.
4. Every change meets the Definition of Done in [ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md) §8.

## Versioning and releases

- Packages follow [Semantic Versioning](https://semver.org/). Below 1.0, a minor version may contain breaking
  changes; at and above 1.0, breaking changes require a new major version. What counts as public, and what
  may grow in a minor, is listed in [ADR-034](./adr/034-what-semver-covers-in-1x.md) and in the
  [compatibility report](./docs/compatibility.md#versioning).
- Releases are produced from CI only, with npm provenance and trusted publishing; nobody publishes from a laptop.
- Every release has a changelog generated from changesets. The
  [compatibility report](./docs/compatibility.md) is refreshed from the full nightly corpus run for
  every release candidate and every major or minor release, and the maintainer links it from the
  GitHub release notes.

## Moderation

Everyone follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Maintainers may hide comments, lock threads, or block
accounts that break it; serious or repeated violations are handled as described there.

## Changes to this document

Changes to governance are made through a pull request that stays open for at least seven days for comments.
