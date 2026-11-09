# ADR-014: `Readable` / `Writable` keep shapes instead of an opt-in flag

- Status: Accepted
- Date: 2026-11-02

## Context

Helpers 0.17 (upstream PR #2549) added `$Read` / `$Write` markers and applies `Readable<T>` to every response and
`Writable<T>` to every request body, also for users who never turn on `--read-write-markers`. Eleven upstream
reports followed (`research/backlog.md`, candidate 10):

| Report | Cause in the type |
|---|---|
| #2615 readonly arrays become objects with numbered keys | `readonly E[]` does not match `(infer E)[]`, so it falls into the object branch |
| #2632, #2673, #2842 tuples become arrays | `(infer E)[]` turns `[A, B]` into `(A \| B)[]` |
| #2620 narrowing breaks | for `allOf` arrays (`A[] & B[]`) `infer E` keeps one member, so properties of the other disappear |
| #2717, #2825 `{ x?: null }` loses `x` | `NonNullable<null>` is `never`, and `never` extends every marker, so the key is dropped |
| #2765, #2766 branded primitives become objects | `string & { __brand }` passes `T extends object` |
| #2726 root types with markers do not match `data` | root aliases keep the markers; `data` has them resolved |

Upstream PR #2650 proposes a type parameter that turns markers on per client (opt-in) and fixes readonly arrays.

## Decision

Fix the two types so that a type without markers comes out unchanged, and keep them applied by default:

1. Primitives, also branded ones, are returned as they are.
2. Arrays resolve `T[number]` (not `infer E`), keep `readonly`, and tuples map homomorphically, so they stay
   tuples (a type is a plain array when an array of its elements is assignable to it).
3. A key is marked only when its non-null value is a marker; a key whose value is only `null` / `undefined` stays.
4. The generator's copy for `--read-write-markers` output holds the same declarations; a test compares the two
   (`packages/openapi-typesafe/test/api/read-write-marker-types.test.ts`). The compatibility report lists the
   changed output as the intentional difference `read-write-marker-helpers`.
5. #2726 (root types with markers) is not fixed: it needs resolved root type variants, which is a feature.
6. Function types are returned as they are (roadmap R1). Mapping one drops its call signatures, so a `Blob`
   (from `--binary-as-blob` or a `transform` callback) or a `Date` lost its methods in response data
   (`data.file.arrayBuffer()` did not type check). Schemas never produce function types, so the types of
   generated output without them do not change; the helper text of `--read-write-markers` output gains one
   line.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Fix the types, keep them on by default (chosen) | Every report except #2726 fixed; no new API; marker users keep working | The types are a little longer |
| Opt-in markers via a type parameter (upstream #2650) | Users without markers get exactly the old types | New API; every marker user must change code; the bugs stay for marker users |
| Remove `Readable` / `Writable` from responses | Simplest | Breaks the `--read-write-markers` feature |

## Consequences

- Users without markers get their own types back; users with markers get correct arrays, tuples and null keys.
- The generator's output for `--read-write-markers` changes (helper text only).

## Amendment (2026-11-09): `any` properties

The type hunt before rc.4 (T3) found that `Readable` dropped a property typed `any` and `Writable`
typed it `undefined`, so `data.meta` failed with TS2339 and a body with `meta` failed with TS2322.
The generator does not write `any`, but hand-written types and transform hooks do. A conditional
type on `any` takes both branches, so `ReadWriteMarkedKeys` counted every `any` key as marked.
openapi-typescript-helpers 0.1.0 has the `Writable` half of the bug.

1. `ReadWriteMarkedKeys` leaves out a key whose value is `any` (`0 extends 1 & T[K]`) before it
   checks for a marker. `Readable` and `Writable` keep the key with its `any` type.
2. The helper text of `--read-write-markers` output changes the same way; the copy and the package
   stay equal (`test/api/read-write-marker-types.test.ts`). Output that compiled still compiles: the
   change only adds back keys, and only where a type has `any`.

## Review trigger

A new report of a type changed by `Readable` / `Writable` without markers, or work on #2726.
