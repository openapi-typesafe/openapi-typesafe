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

- Prereleases go to `next`. Until a stable release that is not deprecated exists, a prerelease
  also takes `latest` (amended 2026-11-05, see below). The placeholder README tells users to
  install `@next`, which stays correct.
- The release scripts (`scripts/release/`) are ours to maintain instead of `changeset publish`;
  Changesets still owns versions and changelogs.
- Renaming `release.yml` or the `npm-publish` environment breaks publishing until every trusted
  publisher is updated.

## Amendment (2026-11-05): `latest` before the first stable release

After `1.0.0-rc.0` and `1.0.0-rc.1`, `latest` still pointed at the deprecated `0.0.0`
placeholder. The npm page of each package showed "This package has been deprecated", and
`npm install openapi-typesafe` without `@next` installed a package with no code.

Decision: a prerelease is still published to `next`. As the last step of `publish.sh`, after
the GitHub releases, `scripts/release/tag-latest.sh` also adds `latest` with `npm dist-tag add`
when the package has no stable release that is not deprecated
(`scripts/release/has-stable-release.sh`; the placeholder does not count). Once 1.0.0 is out,
prereleases go to `next` only, as before. The first release under this rule is `1.0.0-rc.2`;
rc.1 keeps its tags until then.

- `npm dist-tag` over OIDC needs npm 12.2.0 or later (the workflow pins 12.2.1) and the opt-in
  "Allow npm dist-tag" permission on each package's trusted publisher
  ([GitHub changelog, 2026-09-30](https://github.blog/changelog/2026-09-30-opt-in-dist-tag-permissions-for-npm-trusted-publishing)).
  It is set on npmjs.com only (RELEASING.md, step 3).
- Alternatives: keep `latest` on the placeholder until 1.0.0 (the deprecated page during the whole
  rc phase, when testers and first users arrive); move `latest` by hand after each rc (a manual
  2FA step that is easy to forget); un-deprecate the placeholder (`npm install` would still get a
  package with no code).
- A user who installs a prerelease through `latest` gets the range `^1.0.0-rc.N`, which 1.0.0
  satisfies, so they move to the stable release with a normal update.

## Amendment (2026-11-07): build, publish and release are separate jobs

Audit B3 (supply chain, 2026-11-07) found that the one `publish` job held `id-token: write` and a
persisted `contents: write` token while it ran `pnpm install` and the whole verify gate (vitest,
biome, unbuild, size-limit and about 1,000 transitive dev packages). Any of them could read the
OIDC request variables, get a token for the `npm-publish` environment, and publish any version of
all five packages with valid provenance. The environment approval does not help: it approves the
job, and the job then runs that code.

Decision: `release.yml` has four jobs after `version`.

| Job | Permissions | Runs |
|---|---|---|
| `build` | `contents: read` | `pnpm install`, `scripts/verify.sh build lint test size`, `scripts/release/pack-release.sh`: tarballs, SBOMs, changelog sections, `manifest.tsv` (dependency order) and `SHA256SUMS`, uploaded as an artifact. The hash of `SHA256SUMS` is a job output. |
| `publish` | `contents: read`, `id-token: write`, environment `npm-publish` | npm (pinned), then small bash scripts with no dependencies: `verify-tarballs.sh` checks every file against the job output, `npm publish <tarball>` for each version not on npm, `check-provenance.sh` after each, `tag-latest.sh` last. |
| `release` | `contents: write` | `create-github-releases.sh`: tag and GitHub release per package, created through the releases API on the built commit, with SBOM and provenance bundle. |
| `dry-run` | `contents: read` | Manual runs only: the same tarballs with `npm publish --dry-run`. |

- **No dependency code next to the publishing right.** The publish job installs only npm itself,
  restores no cache and keeps no git credentials (`persist-credentials: false`). The build job
  restores no cache either, because its tarballs are what gets published.
- **Integrity chain.** The expected hash of `SHA256SUMS` travels as a job output, not inside the
  artifact, so a changed artifact cannot bring its own matching list.
- **Provenance check.** It reads the SLSA provenance from the registry and requires this
  repository, `.github/workflows/release.yml`, and, for a version published in this run, the
  SHA-512 of the tarball that `build` packed. The registry serves reads from a CDN cache, so a
  version published seconds ago can be missing for a short while: curl retries 7 times with a
  doubling wait (1 to 64 s, 127 s in total; CODING_PRINCIPLES 8.6). That covers the usual delay of
  a few seconds with a wide margin and stays far inside the job limit. Before, one empty read failed
  the job in the middle of a release.
- **`latest` before the first stable release** (amendment of 2026-11-05) is now the last step of
  the publish job, before the GitHub releases instead of after them. The release job runs whenever
  every package is on npm with checked provenance (a job output set before the `latest` step), so a
  failed `latest` step still leaves every package published and released.
- **Reruns.** A rerun publishes nothing twice (versions on npm are skipped and their provenance is
  checked again), creates only the GitHub releases that are missing, replaces a draft left by a
  failed upload, and stops when a tag exists on another commit.
- **Immutable releases.** `gh release create` with files creates a draft, uploads the files and
  then publishes it, which is the order immutable releases need, so they are turned on
  (`scripts/repo/apply-settings.sh`). A published release's tag and files can then not change.
- **Tag creation is not restricted by the ruleset.** A `creation` rule on `refs/tags/*@*` would
  also block the release job unless the workflow token could bypass it. GitHub's ruleset docs list
  roles, teams, installed apps and deploy keys as bypass actors, not the built-in GitHub Actions
  integration, and users report that the API rejects it. Instead, the release job creates each tag
  itself and fails when a tag already exists on another commit, and immutable releases lock the
  tag once its release is out. Who can create such a tag at all: the maintainer, and the `version`
  and `release` jobs (the only jobs with `contents: write`).
- **Time limits** (ADR-029, same rule): `build` 20 minutes (it runs what the old publish job ran),
  `publish` 20 (five packages; see the amendment of 2026-11-08 for the provenance wait), `release` and `dry-run`
  10.
- **npm 12.2.2**, the current release, replaces 12.2.1.
- **Scorecard "Packaging"** now finds the workflow, because `npm publish` is a step of release.yml
  and `actions/setup-node` names the npm registry.

Alternatives: keep one job and only drop the cache (the dev toolchain still runs next to the OIDC
right); a separate workflow for publishing (every trusted publisher names `release.yml`, so five
npm settings would change, and passing the tarballs between workflows needs a `workflow_run`
trigger, a common source of unsafe workflows); `actions/attest-build-provenance` with our own
signature (npm already writes SLSA provenance through trusted publishing).

## Review trigger

npm allows a trusted publisher for a package that does not exist yet; pnpm fails on a failed OIDC
exchange; the beta plan (11.1) changes; or a ruleset can name GitHub Actions as a bypass actor
(then restrict tag creation).

## Amendment (2026-11-08): wait up to 10 minutes for provenance, after publishing every package

The rc.2 release published `openapi-typesafe@1.0.0-rc.2`, then its provenance check got 404 for the
whole 127 s retry window, and the job stopped before the other four packages. A few minutes later
the registry served the attestation. The check was right to fail, but the window was too short and
the order made one slow read leave a release half published.

1. The publish step publishes every package first, then checks the provenance of each. The
   registry's delay then runs for all packages at once.
2. `fetch-provenance.sh` retries every 30 s, 20 times: up to 10 minutes. With the publishing (about
   a minute) that stays inside the 20-minute job limit (ADR-029).
3. A version on npm without valid provenance still fails the job, and no tag or GitHub release is
   made for that run.

| Option | Pros | Cons |
| --- | --- | --- |
| Publish all, then check, 10-minute window (chosen) | One delay for the whole release; no half release from a slow read | A mismatch is found after the other packages are out; the release still fails and has no GitHub releases |
| Keep the order, longer window | Stops before the next package on a mismatch | Up to 50 minutes of waiting; needs a far larger job limit |
| Skip the check when the registry is slow | Never blocks | A release without checked provenance, against SECURITY.md |

Review trigger: a provenance read that takes more than 5 minutes, or npm documenting the delay.

