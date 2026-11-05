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
3. The `publish` job waits for approval in the `npm-publish` environment. Approve it. A push to
   `main` with no changesets and no version missing from npm (`scripts/release/list-unpublished.sh`)
   skips the job, so it asks for approval only when there is something to publish.
4. The job runs the verify gate, publishes each package that is not on npm yet (in dependency
   order), fails if a version has no provenance, then tags `<name>@<version>` and creates a GitHub
   release with the changelog section and a CycloneDX SBOM.

Prereleases (a version with `-`) go to the `next` tag and are marked as prereleases on GitHub.
Until a stable release exists, each prerelease also takes `latest` (ADR-007). That is the last
step, after the GitHub releases; if it fails (for example, "Allow npm dist-tag" is off), turn the
permission on and run `npm dist-tag add <name>@<version> latest` for each package, logged in with
2FA.
`pnpm exec changeset pre exit` before 1.0.0.

## Dry run

Actions → release → Run workflow. The `dry-run` job packs every package and runs
`npm publish --dry-run`; it needs no approval and publishes nothing. Locally:
`scripts/release/publish.sh --dry-run`. npm notes that you are not logged in; for a dry run that
is expected.

## Check a release

- `npm audit signatures` in a project that installs it: every package has a verified attestation.
- The package page on npmjs.com shows "Provenance" with a link to the workflow run.
- The GitHub release has the `<name>@<version>.cdx.json` SBOM attached.

Logs of each run are in the `release-logs` artifact (`.logs/release/` locally).
