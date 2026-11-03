# ADR-020: OpenAPI 3.2 features are typed by default, next to the 3.1 output

- Status: Accepted
- Date: 2026-11-03

## Context

The generator reads 3.2 documents but leaves out the `query` operation, `additionalOperations`,
`itemSchema` and `in: querystring` parameters, with a warning per use. openapi-typescript 7.13
drops them silently; its open PRs disagree on the shape (#2844 writes `query?: never` in every
path item, #2853 only where declared; #2683 replaces `schema` with `itemSchema`). Design and
measurements: [`research/roadmap/R2.md`](../research/roadmap/R2.md).

## Decision

1. The 3.2 features are typed by default, with no flag and no branch on the `openapi` version.
   A document that uses none of the 3.2 keys generates byte-identical output.
2. `query` is an operation member after `trace`, written only when the path item has the key
   (`query?: never` when `--exclude-deprecated` removes it).
3. `additionalOperations` is a path item member, written only when present, keyed by the exact
   method name. The clients do not call these methods.
4. `itemSchema` goes into a sibling `itemContent` map (media type → item type), written only when
   a media type has one. `content` keeps the `schema` type (or `unknown`).
5. An `in: querystring` parameter's content schema type is the `query` member of `parameters`.
   Next to `in: query` parameters (invalid in 3.2), it keeps its warning and is not typed.
6. `components.mediaTypes` gets a `components` member only when present; `content` entries that
   reference it are typed as that reference.
7. The clients get `QUERY` (`HttpMethod` includes `"query"`); the path-based client maps only HTTP
   method keys.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Chosen: typed by default, members only where declared | 3.0/3.1 output unchanged; 3.2 documents gain types | `query` is the one method without `?: never` everywhere |
| An opt-in flag | nothing changes without it | the default output of a 3.2 document leaves operations out; every user needs the flag |
| `query?: never` in every path item (PR #2844) | uniform with other methods | changes every generated file; no client needs it (`PathsWithMethod` checks presence) |
| `itemSchema` replaces `schema` in `content` (PR #2683) | clients see the item type | the complete-body type is wrong for a stream and lost when both exist |
| Typed `request()` for custom methods | `additionalOperations` callable | a second lookup path through every client type; `request` upper-cases the method; one corpus use, a stream |

## Consequences

- 3.2 documents gain `query`, `additionalOperations`, `itemContent`, `querystring` and
  `mediaTypes` types; the matching warnings go away (the `querystring` warning stays for the
  invalid mix).
- `HttpMethod` grows by one member; code that maps over it exhaustively (a `Record<HttpMethod, …>`
  written by a user) needs a `query` entry. Changeset says so.
- `ClientForPath` no longer offers `PARAMETERS`, which was typed but always failed.
- Custom methods are typed but not callable through the clients.

## Review trigger

openapi-typescript merges a 3.2 shape that differs from this one, or a user asks to call an
`additionalOperations` method through a client.
