# ADR-007: Release, provenance and npm name reservation

- Status: Accepted
- Date: 2026-11-02

## Context

ENGINEERING_PLAN 9.3, 9.4 and 9.4a. Facts checked on 2026-11-02:

- The five names `openapi-typesafe`, `openapi-typesafe-fetch`, `openapi-typesafe-react-query`,
  `openapi-typesafe-helpers` and `openapi-typesafe-migrate` are free on npm (`npm view` returns
  E404).
- A trusted publisher can be added only to a package that already exists on the registry
  ([npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust)). So the first version of each
  name has to be published another way.
- A trusted publisher that has not published within 48 hours expires
  ([GitHub changelog, 2026-10-02](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire)).
- Trusted publishing adds provenance on its own, but provenance is not generated for private
  repositories ([npm trusted publishers](https://docs.npmjs.com/trusted-publishers)). It needs
  npm 11.5.1 or later.
- `pnpm publish` does the OIDC exchange itself and only warns when it fails, then publishes with
  any other credential. `npm publish` fails instead.
- The closed beta (11.1) uses packed tarballs, so no name is needed on npm before 11.2.

## Decision

1. **Publishing.** Only `.github/workflows/release.yml` publishes, from the `npm-publish`
   environment with required reviewers. It uses npm trusted publishing (OIDC) and no npm token is
   stored anywhere. Each package is packed with `pnpm pack` (which replaces `workspace:` versions)
   and the tarball is published with `npm publish`. A version that reaches npm without provenance
   fails the job.
2. **Bootstrap.** Each name gets one placeholder, version `0.0.0`, published by hand from the
   maintainer's account with 2FA (`scripts/release/reserve-names.sh` builds them). The placeholder
   has no code, says the name is reserved, and is deprecated right after publishing. Then the
   trusted publisher is added (repository, `release.yml`, `npm-publish`), publishing access is
   set to "Require two-factor authentication and disallow tokens", and the first real version
   (`1.0.0-rc.0`, 11.3) is published by the workflow within 48 hours.
3. **Timing.** The names are reserved at the start of 11.1, before testers get the tarballs. Before
   that, the names exist only in the private repository.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Placeholders at the start of 11.1 (chosen) | Names are safe from the moment people outside the maintainer see them; every real version has provenance | A placeholder with no code is visible on npm for the weeks of the beta |
| Placeholders now | No squatting risk at all | The project is visible on npm months early, with nothing to show |
| Placeholders at 11.2, when the repository goes public | Shortest time with a visible placeholder | Beta testers know the names for weeks before they are reserved |
| First real version by hand, no placeholder | No placeholder | That version has no provenance, against SECURITY.md ("a release without provenance is not an official release") |
| `pnpm publish` or `changeset publish` in CI | Less custom script | A failed OIDC exchange only warns, so a release could go out without provenance |

## Consequences

- `latest` points at the deprecated placeholder until 1.0.0 (11.4); prereleases go to `next`.
  The placeholder README tells users to install `@next` until then.
- The release scripts (`scripts/release/`) are ours to maintain instead of `changeset publish`;
  Changesets still owns versions and changelogs.
- Renaming `release.yml` or the `npm-publish` environment breaks publishing until every trusted
  publisher is updated.

## Review trigger

npm allows a trusted publisher for a package that does not exist yet; pnpm fails on a failed OIDC
exchange; or the beta plan (11.1) changes.
