# ADR-030: A `$ref` resolution check before Redocly lints and bundles

- Status: Accepted
- Date: 2026-11-06

## Context

Redocly's `resolveDocument` (1.34.22, and the same loop in 2.76) collects one promise per `$ref`
lookup and waits with `Promise.all` until no new lookups appear. `Promise.all` stops at the first
rejection. Lookups that were still running, or that started after it (the walk of a document that
was still loading), are never awaited. When one of them fails as well, its rejection is unhandled.

A lookup fails for three reasons, which the loader already turns into typed errors (ADR-011): a
`$ref` chain that points back to itself ("Self-referencing circular pointer"), a malformed percent
escape (`URIError`), and a key named like an `Object.prototype` method (`TypeError`). When the
failure is reached from two documents, for example a root schema that is a `$ref` to itself and an
external file that refers to it, the first failure became the typed error and the second one an
unhandled rejection:

- the CLI printed the typed error, then Node.js printed a stack trace and exited with 1, the exit
  code of stale `--check` output, instead of 3;
- the Node API rejected correctly, and the unhandled rejection then ended the user's process.

The loop is inside Redocly; `lintDocument` and `bundle` call it directly and take no other
resolver. A dependency patch (`pnpm patch`) does not reach users' installs. A process-wide
`unhandledRejection` listener would change how the user's own rejections are handled.

## Decision

1. Before it lints or bundles, the loader runs its own resolution walk
   (`adapters/redocly-loader/ref-resolution-check.ts`). It is a port of Redocly's
   `resolveDocument`: the same types (from the same Redocly config), the same nodes, the same
   errors. It waits for every lookup with `Promise.allSettled` and only then throws the first
   failure: the one from the root walk, else the first lookup in start order.
2. Documents load through the same resolver, so Redocly's lint and bundle reuse the cache and
   read nothing twice. When the check passes, Redocly's own walk meets no failing lookup.
3. The port follows Redocly 1.34; the review trigger below names when it must be compared again.
   An upstream report of the loop is a separate, outward step.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Port of the walk that waits for every lookup (chosen) | Exact: same nodes and errors; no global state; about 1% of a run on the GitHub API document | About 300 lines that follow a dependency's internals |
| Patch the dependency (`pnpm patch`) | One-line fix | Applies to this repository only, not to users' installs |
| Process-wide `unhandledRejection` listener during a load | Small | Changes the handling of the user's own rejections while it is installed; the CLI and the Node API share the loader |
| Check only the three failure kinds up front, on the raw documents | No port | Not exact: Redocly does not follow a `$ref` inside example data, so the check would reject valid documents or miss cross-file cycles |
| Wait for an upstream fix | No code | 1.x is in archive mode; users' processes crash until then |

## Consequences

- The three failures above give one typed error, exit code 3 in the CLI, and no unhandled
  rejection, whichever document they are in.
- Every load walks the documents once more; measured on `examples/github-api.yaml`, the run time
  stays within noise (1.1 s).
- A Redocly config with preprocessors that add `$ref`s is checked as written, before the
  preprocessors run; Redocly resolves the added refs itself, as before.

## Review trigger

A Redocly update changes `lib/resolve.js` (compare the port), the move to Redocly 2.x (ADR-005), or
an upstream release that awaits every lookup (then the check can go).
