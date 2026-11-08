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
