# Releasing

How packages get to npm (ADR-007). Only `.github/workflows/release.yml` publishes; nobody
publishes from a laptop, except the one-time placeholders below.

## One-time setup

Do these in order. Steps 3–5 need the repository to be public (ENGINEERING_PLAN 11.2), because npm
does not generate provenance for private repositories.

1. **Reserve the names** (start of 11.1). Run `scripts/release/reserve-names.sh` and then the
   commands it prints, logged in to npm with 2FA. It publishes a code-free `0.0.0` of each name and
   deprecates it.
2. **Create the `npm-publish` environment** in the repository settings: required reviewer = the
   maintainer, deployment branches = `main` only.
3. **Add a trusted publisher** to each of the five packages on npmjs.com (package settings →
   Trusted publisher → GitHub Actions): owner and repository of this repository, workflow
   `release.yml`, environment `npm-publish`. Turn on **Allow npm dist-tag** for it: until the
   first stable release, the workflow also tags each prerelease `latest` (ADR-007). A publisher
   that has not published within 48 hours expires, so do this just before step 5.
4. **Turn off tokens**: package settings → Publishing access → "Require two-factor authentication
   and disallow tokens". Trusted publishing keeps working.
5. **First release**: `pnpm exec changeset pre enter rc`, add a major changeset for each package,
   merge, then merge the "chore(release): version packages" pull request. That gives
   `1.0.0-rc.0` on the `next` tag (11.3).

## Closed beta (11.1)

The beta runs while the repository is private, so nothing goes to npm.

1. `scripts/release/pack-beta.sh 1.0.0-beta.<n>` builds the packages and writes the tarballs,
   `SHA256SUMS` and `RELEASE_NOTES.md` (install steps for testers) to `.release/beta/<version>/`.
   The tarballs carry the beta version and pin each other to it; `package.json` files stay as they
   are. A smoke install of the client tarballs runs before the script succeeds. Log:
   `.logs/release/pack-beta-<version>.log`.
2. Add the testers as read-only collaborators.
3. Run the `gh release create` command the script prints. It creates a prerelease with the
   tarballs attached, visible only to collaborators.
4. Triage reports as issues; fixes go in with changesets as usual. Pack a new `beta.<n+1>` when
   enough has changed.

## Every release

1. Pull requests carry changesets (`pnpm changeset`).
2. On `main`, the release workflow keeps the "chore(release): version packages" pull request up to
   date. Merge it when the release is ready.
3. The `build` job runs the verify gate and packs every public package
   (`scripts/release/pack-release.sh`): tarballs, SBOMs, changelog sections, `manifest.tsv` and
   `SHA256SUMS`, uploaded as the `release-packages` artifact. It has no publishing right. A push to
   `main` with no changesets and no version missing from npm (`scripts/release/list-unpublished.sh`)
   skips it and the jobs after it, so the workflow asks for approval only when there is something
   to publish.
4. The `publish` job waits for approval in the `npm-publish` environment. Approve it. It installs
   only npm, checks every file against the hash that `build` wrote in its outputs
   (`scripts/release/verify-tarballs.sh`), and publishes each tarball that is not on npm yet, in
   dependency order. Only when all of them are published does it check the provenance of each
   version (`scripts/release/check-provenance.sh`): it must name this repository, `release.yml`
   and, for a version published in this run, the SHA-512 of the tarball that `build` packed. The
   registry serves a new attestation only after a delay, so `scripts/release/fetch-provenance.sh`
   retries every 30 seconds for up to 10 minutes per package. Because the checks come after all
   publishes, that delay runs for all packages at once, and a slow check never leaves the rest of
   a release unpublished.
5. The `release` job creates the tag `<name>@<version>` on the built commit and a GitHub release
   with the changelog section, the CycloneDX SBOM and the npm provenance bundle
   (`scripts/release/create-github-releases.sh`).
6. The `docs` job deploys the docs site from the tag `openapi-typesafe@<version>` when that version
   is on the npm `latest` tag (ADR-042): it starts `.github/workflows/docs.yml` with the tag. The
   site never shows `main`, so a docs fix goes live with the next release. To rebuild the site by
   hand: Actions → docs → Run workflow on `main`, with a release tag or empty for the `latest`
   version.
7. Link `docs/compatibility.md` from the GitHub release notes of a release candidate or a minor or
   major release. The page is refreshed before the release, as below.

Prereleases (a version with `-`) go to the `next` tag and are marked as prereleases on GitHub.
Until a stable release exists, each prerelease also takes `latest` (ADR-007): the last step of the
`publish` job (`scripts/release/tag-latest.sh`). If it fails (for example, "Allow npm dist-tag" is
off), the `release` job still runs. Turn the permission on and re-run the failed jobs, or run
`npm dist-tag add <name>@<version> latest` for each package, logged in with 2FA.
`pnpm exec changeset pre exit` before 1.0.0. The changesets in `.changeset/pre/` become the 1.0.0
changelog, so they describe the change from the stable upstream versions, not from the last rc
(ADR-040).

### Refresh the compatibility report

For every release candidate and every minor or major release, `docs/compatibility.md` is refreshed
**before you merge the "chore(release): version packages" pull request**. The docs site is built
from the release tag (ADR-042), so a refresh merged after the release would wait for the next one.
The version pull request changes only versions and changelogs, so a run on the commit before it
measures the code that is released.

1. When every change for the release is on `main`, run the full corpus on that commit: Actions →
   compat → Run workflow on `main`. The nightly run counts too, if no commit after it changed
   `packages/`. Its `compatibility (full, report)` job must pass the release gate.
2. Download its `compat-all` artifact:
   `tools/compat-harness/.cache/compat/reports/fork-base__vs__current.md` has the numbers.
3. In `docs/compatibility.md`, update the result line, the tables of "Summary" and its
   subsections, and "Real projects". The result line names the version about to be released (the
   version pull request shows it), the commit that was measured and the date of the run, for
   example `**Result (openapi-typesafe 1.0.0-rc.4, commit 0123456789ab, run of 2026-11-09):**`.
   Update the totals in `docs/introduction.md` if they changed.
4. Merge the refresh in its own pull request (`docs(compat): refresh the report for <version>`),
   then merge the version pull request.

### When a run fails

Re-run the failed jobs. Nothing is done twice:

- `publish` skips every version that is already on npm and checks its provenance again;
- `release` skips every GitHub release that exists, replaces a draft that a failed upload left, and
  stops if a tag already exists on another commit (then find out who created it before you go on);
- a re-run of `build` packs again and replaces the artifact. Packing is reproducible, but a version
  that is already on npm is not compared with the new tarball, only checked for provenance.

## Dry run

Actions → release → Run workflow. The `build` job packs every package, and the `dry-run` job checks
the tarballs and runs `npm publish --dry-run` for each one that is not on npm yet; it needs no
approval and publishes nothing. Locally, after `pnpm build`:
`scripts/release/pack-release.sh .release/npm`, then `npm publish --dry-run <tarball>` for a
tarball in `.release/npm/`. npm notes that you are not logged in; for a dry run that is expected.

## Check a release

- `npm audit signatures` in a project that installs it: every package has a verified attestation.
- The package page on npmjs.com shows "Provenance" with a link to the workflow run.
- The GitHub release has the `<name>@<version>.cdx.json` SBOM and the
  `<name>@<version>.provenance.sigstore.json` npm provenance bundle attached. With immutable
  releases on (`scripts/repo/apply-settings.sh`), GitHub marks the release immutable: its tag and
  files cannot change.

A fresh version is not installable everywhere at once. Package managers with a minimum release age
skip a version until it is older than that age, and resolve the previous one or fail: Yarn 4
(`npmMinimalAgeGate`, 24 hours in the Yarn 4 releases we tested), bun (`minimumReleaseAge` in
`bunfig.toml`, often set to 7 days), pnpm (`minimumReleaseAge`; this repository uses 24 hours) and
npm (`min-release-age`). This is expected and needs no fix. When you ask people to try a release
candidate right after it is published, say so: they wait, or exempt the `openapi-typesafe*`
packages from the gate (Yarn `npmPreapprovedPackages`, bun `minimumReleaseAgeExcludes`, pnpm
`minimumReleaseAgeExclude`).

The verify logs of each run are in the `release-verify-logs` artifact (`.logs/verify/` locally).
