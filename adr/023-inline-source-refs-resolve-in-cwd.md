# ADR-023: Relative `$ref`s of an inline source resolve in `cwd`

- Status: Accepted
- Date: 2026-11-04

## Context

The Node API takes a source that is not a file: a string, an object, a buffer or a stream. The CLI
passes stdin the same way. openapi-typescript 7.13 gives Redocly the `cwd` directory itself as the
location of such a document. Redocly resolves a relative `$ref` against the directory of the
document, which for `/app/specs/` is `/app`: `./pet.yaml` is read from the parent of `cwd`. This happens with the default `cwd`, a string and a URL. A string `cwd` was also turned into
a URL without encoding, so a `#` or `%` in the path broke it.

1.0.0-rc.0 kept this behaviour for parity with 7.13. A project that works today must keep its
shared files one level up, which nobody would choose; the docs said `cwd` helps to resolve `$ref`s.

## Decision

An inline source is named `<cwd>/inline-source`, so relative `$ref`s resolve in `cwd`. A string or
buffer `cwd` is resolved and converted with `pathToFileURL`; a URL `cwd` without a trailing slash is
a directory. File and URL sources do not change: they resolve from their own location.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Resolve in `cwd` (chosen) | What `cwd` says; matches file sources | Changes where a working 7.13 setup looks |
| Keep the parent of `cwd` | Byte parity with 7.13 | Surprising; hard to document; a bug people work around |
| Opt-in `fix` value | No change by default | A default nobody wants, kept for all of 1.x |

## Consequences

A project that put the shared files in the parent of `cwd` to make 7.13 work fails with
`SCHEMA_INVALID` ("Can't resolve $ref") and must pass the right `cwd`. The release notes and the
docs (`docs/node.md`, `docs/cli.md`) say so. The generated types do not change.

## Review trigger

A report from a user whose working setup broke because of this change.
