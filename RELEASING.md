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
   dependency order. After each one it checks the provenance
   (`scripts/release/check-provenance.sh`): it must name this repository, `release.yml` and the
   SHA-512 of the tarball that `build` packed. The registry can lag behind a publish, so the check
   retries for up to about two minutes.
5. The `release` job creates the tag `<name>@<version>` on the built commit and a GitHub release
   with the changelog section, the CycloneDX SBOM and the npm provenance bundle
   (`scripts/release/create-github-releases.sh`).

Prereleases (a version with `-`) go to the `next` tag and are marked as prereleases on GitHub.
Until a stable release exists, each prerelease also takes `latest` (ADR-007): the last step of the
`publish` job (`scripts/release/tag-latest.sh`). If it fails (for example, "Allow npm dist-tag" is
off), the `release` job still runs. Turn the permission on and re-run the failed jobs, or run
`npm dist-tag add <name>@<version> latest` for each package, logged in with 2FA.
`pnpm exec changeset pre exit` before 1.0.0.

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

The verify logs of each run are in the `release-verify-logs` artifact (`.logs/verify/` locally).
