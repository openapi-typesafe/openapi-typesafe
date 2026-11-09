# ADR-042: The docs site follows the latest release

- Status: Accepted
- Date: 2026-11-08

## Context

`.github/workflows/docs.yml` built the docs site from `main` and deployed it to GitHub Pages on
every push. The site is what users read next to the version they install. On 2026-11-08, while
`npm install openapi-typesafe` gave `1.0.0-rc.3`, the site already described changes merged for
rc.4: new `CLI_OUTPUT_*` error codes, ISO 8601 date parameters and the TypeScript 5.4 peer floor
(RC4 bug list, item 55). A reader of rc.3 found codes and behavior that their version does not
have.

The npm `latest` tag says which version a reader most likely has: `npm install <name>` installs
it. Until the first stable release, `tag-latest.sh` moves `latest` to each prerelease (ADR-007);
after it, a prerelease goes to `next` only.

The `github-pages` environment deploys from the default branch only, and events made with the
workflow token start no workflows, except `workflow_dispatch` and `repository_dispatch`.

## Decision

1. **The site is built from the release tag of the version on the npm `latest` tag of
   `openapi-typesafe`** (`openapi-typesafe@<version>`), not from `main`. The generator package
   names the release: the five packages are versioned together (`fixed` in
   `.changeset/config.json`), and its tag covers the whole repository.
2. **`release.yml` starts the deployment.** A new `docs` job runs after the `release` job, when
   the tags exist. When the released `openapi-typesafe` version takes `latest` (a stable version,
   or a prerelease while the package has no stable release, the same rule as `tag-latest.sh`), it
   runs `gh workflow run docs.yml -f tag=openapi-typesafe@<version>` on `main`. Its only right is
   `actions: write`.
3. **`docs.yml` has only `workflow_dispatch`**, with an optional `tag` input. Empty, it reads the
   `latest` version from the npm registry, so a manual run rebuilds the current site. The input
   must look like `openapi-typesafe@<semver>`, and the checkout uses `refs/tags/<tag>`, so a branch
   cannot be deployed by mistake. The run stays on `main` for the `github-pages` environment; the
   workflow file comes from `main`, the site from the tag.
4. **A docs fix waits for the next release.** It is merged to `main` as before; CI still builds the
   site and checks its links on every pull request (ADR-039). A fix that cannot wait gets a patch
   release.
5. **Time limits** (ADR-029): the new `docs` job of `release.yml` takes under a minute, so it has
   the minimum of 10 minutes. The `docs.yml` jobs keep 10 and 15.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Build from the release tag of the `latest` version (chosen) | The site matches what `npm install` gives; no new infrastructure | A docs-only fix waits for a release |
| Build from `main` (before) | Docs fixes are live at once | The site describes unreleased behavior (item 55) |
| Trigger on `release: published` or on tag pushes | No change to `release.yml` | The release job creates releases and tags with the workflow token, which starts no workflows; a tag push from a laptop bypasses the release process |
| A second `next` site built from `main`, next to the release site | Users of `main` and of prereleases after 1.0 get their docs | GitHub Pages serves one site per repository, so both builds must go into one artifact with a version switch; more build time and a new VitePress base path for little use now |
| Mark unreleased sections in the docs by hand | Keeps one build from `main` | Easy to forget; every pull request that changes behavior must add and later remove a marker |

## Consequences

- After this change is merged, the site keeps the last deployment from `main` until the next
  release or a manual run of `docs.yml`; run it once by hand to put the site back to `latest`.
- `docs-links.yml` still checks the external links of `main` (ADR-039), so a broken link is found
  before it reaches the released site.
- The site of a prerelease after 1.0.0 is not published. If that is needed, the `next` site above
  is the way.

## Review trigger

A prerelease after 1.0.0 whose users need its docs, or a docs fix that had to wait for a release
and could not.
