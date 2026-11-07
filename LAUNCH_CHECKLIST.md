# Launch checklist

The steps of the 1.0 launch. Every step below is a one-way action, so the maintainer decides when
each one starts. The commands and details are in [RELEASING.md](RELEASING.md).

State on 2026-11-07: the repository is public since 2026-11-04. `1.0.0-rc.0` (2026-11-04) and
`1.0.0-rc.1` (2026-11-05) are on npm under `next`, with provenance. Trusted publishing is on and
token publishing is off for all five packages. The rc.1 acceptance fixes are merged (PR #15); the
pre-1.0 audit fixes are in PR #16. Left: `1.0.0-rc.2`, `1.0.0` and the skill registry.

## Done

- [x] ADR-007 (release process) accepted.
- [x] Threat model has no open risks: R1/R2 are covered by the `localRefRoot` and
      `remoteRefHosts` options (ADR-017).
- [x] Code of Conduct contact set; `package.json` files name the author without an email.
- [x] GitHub Pages deploy workflow (`.github/workflows/docs.yml`), started on a public repository.
- [x] GitHub Actions enabled for the repository.
- [x] `fork-base` tag pushed; the compat workflow builds the golden generator from it.

## 1. Closed beta

- [x] npm organization `openapi-typesafe` created (owner `fedorello`): it guards the
      `@openapi-typesafe` scope. The packages themselves are unscoped.
- [x] Turn on 2FA enforcement for the npm organization.
- [x] Reserve the npm names: `scripts/release/reserve-names.sh`, then the commands it prints
      (npm account with 2FA). All five names hold a deprecated, code-free `0.0.0` (2026-11-02).
- [x] Our own deep testing first: [research/pre-beta-test-plan.md](research/pre-beta-test-plan.md)
      (done 2026-11-03).
- [x] Pack the beta from the tested `main`: `scripts/release/pack-beta.sh 1.0.0-beta.3` (smoke
      install passed), then run the `gh release create` command it prints: private prerelease
      `beta-1.0.0-beta.3` with the five tarballs and `SHA256SUMS`. Checked as a tester would:
      checksums, install, generate, type-check, ESM and CJS with npm, pnpm, Yarn and Bun, and
      the migration command. The earlier `beta.1` and `beta.2` releases, which nobody had, were
      deleted so testers see one beta. `beta.4` (2026-11-03) and `beta.5` (2026-11-04) followed
      the same way; `beta.4` was deleted after rc.1.
- [x] Testers: replaced. Eight invitations sent on 2026-11-03 got no reply, so on 2026-11-06 the
      maintainer replaced human testers with agent acceptance tests.
- [x] Tester reports: replaced by the findings of those acceptance tests, fixed in PR #15.

## 2. Make the repository public

Done on 2026-11-04.

- [x] Beta issues fixed.
- [x] Check once more that no personal files are in the repository or its history.
- [x] Make the repository public.
- [x] `scripts/repo/apply-settings.sh --apply`: rulesets for `main` and release tags, secret
      scanning with push protection, private vulnerability reporting, the `npm-publish`
      environment, pull requests opened by workflows, GitHub Pages.
- [ ] Decide on the `sha_pinning_required` Actions setting (all actions are already SHA-pinned;
      the setting is still off).
- [x] `docs`, `scorecard` and `release` run and pass; the docs site is live.
- [x] The macOS and Windows test jobs run (macOS on `macos-15-intel`).

## 3. Release candidates on npm

- [x] Add a trusted publisher to each of the five packages on npmjs.com (`release.yml`,
      environment `npm-publish`); "Allow npm dist-tag" turned on 2026-11-05.
- [x] Turn off token publishing for each package (`npm access set mfa=publish`).
- [x] `pnpm exec changeset pre enter rc`, major changesets, merge the version pull request.
- [x] `1.0.0-rc.0` (2026-11-04) and `1.0.0-rc.1` (2026-11-05) published under `next` with
      provenance.
- [x] Publish the compatibility report (`docs/compatibility.md`, run of 2026-11-04).
- [ ] Merge PR #16, then the version pull request for `1.0.0-rc.2`, and approve `publish`. The
      workflow tags it `latest` as well as `next`, which replaces the `0.0.0` placeholder on
      `latest`.
- [ ] Refresh `docs/compatibility.md` from the full nightly run of the release candidate, and
      link it from the GitHub release notes.

## 4. Stable release

- [ ] `pnpm exec changeset pre exit`, merge the version pull request, approve `publish`.
- [ ] `1.0.0` on the `latest` tag with provenance.
- [ ] Remove the "Release candidate" sentence from the READMEs and the docs introduction.

## 5. Agent skill

- [ ] Publish `skills/openapi-typesafe/SKILL.md` to the skills registry.

## Working rules

- Verify locally first
  (`VERIFY_FAIL_ON_WARNINGS=1 scripts/verify.sh build lint test size coverage types skills`,
  plus the tests on Node.js 22 and 24 with `npx node@22` / `npx node@24`), and push several
  fixes at once to save runner time.
