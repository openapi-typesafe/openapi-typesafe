# Launch checklist

The steps left before and after the repository goes public (ENGINEERING_PLAN phases 10–11).
Every step below is a one-way action, so the maintainer decides when each one starts. The
commands and details are in [RELEASING.md](RELEASING.md).

State on 2026-11-02: everything that can be done in the private repository is done, and CI on
`main` is green (`ci`, `compat`). `docs`, `release` and `scorecard` skip themselves until the
repository is public.

## Done

- [x] ADR-007 (release process) accepted.
- [x] Threat model has no open risks: R1/R2 are covered by the `localRefRoot` and
      `remoteRefHosts` options (ADR-017).
- [x] Code of Conduct contact set; `package.json` files name the author without an email.
- [x] GitHub Pages deploy workflow (`.github/workflows/docs.yml`), started on a public repository.
- [x] GitHub Actions enabled for the repository.
- [x] `fork-base` tag pushed; the compat workflow builds the golden generator from it.

## 1. Closed beta (11.1)

- [x] npm organization `openapi-typesafe` created (owner `fedorello`): it guards the
      `@openapi-typesafe` scope. The packages themselves are unscoped.
- [x] Turn on 2FA enforcement for the npm organization.
- [x] Reserve the npm names: `scripts/release/reserve-names.sh`, then the commands it prints
      (npm account with 2FA). All five names hold a deprecated, code-free `0.0.0` (2026-11-02).
- [x] Pack the beta: `scripts/release/pack-beta.sh 1.0.0-beta.1` (smoke install passed).
- [x] Our own deep testing first: [research/pre-beta-test-plan.md](research/pre-beta-test-plan.md);
      then pack `1.0.0-beta.2`. Done 2026-11-03: private prerelease `beta-1.0.0-beta.2`.
- [ ] Add 10–20 testers as read-only collaborators.
- [x] Run the `gh release create` command the script prints: private prerelease
      `beta-1.0.0-beta.1` with the five tarballs and `SHA256SUMS` (2026-11-02).
- [ ] Triage tester reports as issues; fix with changesets; pack `beta.<n+1>` when needed.

## 2. Make the repository public (11.2)

- [ ] Beta issues fixed.
- [ ] Check once more that no personal files are in the repository or its history.
- [ ] Make the repository public.
- [ ] `scripts/repo/apply-settings.sh` (dry run), then `scripts/repo/apply-settings.sh --apply`:
      rulesets, secret scanning with push protection, private vulnerability reporting, the
      `npm-publish` environment, pull requests opened by workflows, GitHub Pages.
- [ ] Decide on the `sha_pinning_required` Actions setting (all actions are already SHA-pinned).
- [ ] Check that `docs`, `scorecard` and `release` now run and pass; the docs site is live.
- [ ] Start the macOS and Windows test jobs (they skip on a private repository).

## 3. Release candidate on npm (11.3)

- [ ] Add a trusted publisher to each of the five packages on npmjs.com (`release.yml`,
      environment `npm-publish`), just before the first release.
- [ ] Turn off token publishing for each package.
- [ ] `pnpm exec changeset pre enter rc`, major changesets, merge the version pull request.
- [ ] Approve the `publish` job; check provenance on npm for `1.0.0-rc.0` (`next` tag).
- [ ] Publish the compatibility report: ≥ 99% byte match, 100% type identity.

## 4. Stable release (11.4)

- [ ] `pnpm exec changeset pre exit`, merge the version pull request, approve `publish`.
- [ ] `1.0.0` on the `latest` tag with provenance.

## 5. Agent skill (10.3)

- [ ] Publish `skills/openapi-typesafe/SKILL.md` to the skills registry.

## Working rules

- CI minutes on the private repository are limited: verify locally first
  (`VERIFY_FAIL_ON_WARNINGS=1 scripts/verify.sh build lint test size coverage types skills`,
  plus the tests on Node.js 22 and 24 with `npx node@22` / `npx node@24`), and push several
  fixes at once.
