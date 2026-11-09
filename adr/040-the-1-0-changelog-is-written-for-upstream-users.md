# ADR-040: The 1.0.0 changelog is written for upstream users

- Status: Accepted
- Date: 2026-11-08

## Context

The packages are in Changesets pre mode with the tag `rc` (`.changeset/pre.json`). Changesets 3
keeps every changeset of a release candidate in `.changeset/pre/`. When we run
`changeset pre exit` and `changeset version`, all of them become the `1.0.0` entry of each
`CHANGELOG.md`, one bullet per file, sorted by file name.

Most people who install 1.0.0 come from the stable upstream versions: openapi-typescript 7.13,
openapi-fetch 0.17, openapi-react-query 0.5.4 and openapi-typescript-helpers 0.1.0. They never
installed our release candidates. Before this decision the `1.0.0` entry would have had about 60
bullets. Some of them fixed bugs that existed only in an rc, or named exports that only an rc had,
which means nothing to these readers.

## Decision

The changesets in `.changeset/pre/` describe the change from the stable upstream version, not from
the previous rc:

1. A fix of a bug that only an rc had gets no changeset. When it is not clear that the bug never
   was in the stable upstream version, the changeset stays.
2. A changeset does not name APIs or codes that only an rc had.
3. Small fixes of one theme in one package are one changeset with a short list (for example "CLI
   fixes" or "Output that did not compile now compiles").
4. A changeset that credits an upstream contributor is not merged into another one, so the credit
   stays in the changelog.
5. Every change that can need work when moving from upstream is listed in the `major` changeset of
   its package, with what to do.

A pull request that adds a changeset while we are in pre mode follows the same rules. The rc
entries already in each `CHANGELOG.md` stay as they were released.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Curate the pre changesets for upstream users (chosen) | The 1.0.0 entry reads in a few minutes and is true for its readers | Manual work before 1.0.0; rc-only fixes are visible only in the rc entries |
| Keep every changeset as written | No work | Long entry; rc-only fixes and removed rc names confuse upstream users |
| Write the 1.0.0 entry by hand after `changeset version` | Full control over the text | Lost at the next `changeset version` run; the release pull request no longer comes from the changesets |

## Consequences

- The `1.0.0` entry is shorter than the sum of the rc entries; a user of an rc reads the rc
  entries for what changed between candidates.
- A merged changeset links to the pull request of the file it was merged into.

## Review trigger

A release candidate after 1.0.0 (for example 1.1.0-rc.0), or a reader of the 1.0.0 entry who could
not find a change they needed.

## Amendment (2026-11-09): one entry per change, no internal references

A check of the simulated 1.0.0 entries (`changeset pre exit`, then `changeset version` in a scratch
copy) found the TypeScript 5.4 peer floor and the `ResponseError` of the hooks twice: once in the
`major` changeset (rule 5) and once in a changeset of their own. Other changesets fixed bugs of an
rc only (a `FetchOptions` wrapper type, the migrate tool, which has no upstream version), listed
small fixes of one theme apart (rule 3), named audit findings and ADR numbers that readers of the
changelog cannot look up, and said that output that compiled does not change while two enum names
did change.

6. A change that rule 5 lists in the `major` changeset gets no changeset of its own. When another
   changeset also describes it (a fix with a wire or name change), that changeset says only what
   the list does not and points to Major Changes.
7. A change that fits a changeset in `.changeset/pre/` (the same feature, list or theme, rule 3)
   is written into that changeset, not into a new one.
8. Changeset texts name no audit finding, hunt item or ADR. The changelog is read on npm and on
   GitHub releases, where these mean nothing; the pull request and the commit carry them.
   `pnpm lint` checks it (`scripts/check-changeset-texts.mjs`).
9. A claim that output stays the same names its exceptions. Every output change of a valid schema
   that compiled before is in the `major` list of the generator, with the new name.

Consequence: the rc entry of the next candidate does not show a change that went into a changeset
of `.changeset/pre/` (rules 6 and 7); the 1.0.0 entry does. Users of a candidate read its pull
requests and the migration guide, which list every change.

## Amendment (2026-11-09): what rule 8 looks for

The recheck found that the rule 8 check knew only `ADR-<number>`, "audit finding" and "hunt item",
so `ADR 043`, `adr-043`, a link to `adr/…`, "security audit (B2)", "round-2 hunt (S4)" and
"Fixes PB-14" passed. The check now finds an ADR in any of these spellings, a link or path into
`adr/`, the words "audit" (not `npm audit`) and "hunt", and the items of the audit and hunt
reports: `(B2)`, `(S4)`, `(G13)`, `(RC4 S4)` in parentheses and `PB-<number>`. Item names stay
apart from public ones: `TS2589`, `ISO 8601`, `UTF-8`, threat model items such as `T2` and
`R1`, and `S3` outside parentheses pass. The patterns live in `scripts/changeset-texts.mjs`, with
tests that `pnpm lint` runs on Node's own test runner, so the check needs no test framework at
the root.

| Option | Pros | Cons |
| --- | --- | --- |
| Patterns for each form, with tests (chosen) | Finds the forms that were missed; tested false positives | A new kind of report item needs a new pattern |
| Any `[A-Z]+-?\d+` token | Finds every item name | Flags `UTF-8`, `TS2589`, `ISO-8601` and threat model items |
| Review by hand | No code | Missed six forms in one round |
