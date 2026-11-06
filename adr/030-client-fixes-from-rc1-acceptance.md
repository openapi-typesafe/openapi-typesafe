# ADR-030: Client fixes from the rc.1 acceptance tests

- Status: Accepted
- Date: 2026-11-06

## Context

The acceptance testers of 1.0.0-rc.1 found five bugs in `openapi-typesafe-fetch` and one false
claim. Each one was reproduced with a failing test first.

| Finding | Root cause |
| --- | --- |
| A `..` path parameter on a template with `?` or `#` (`/echo/{id}?v=2`) went to the parent path | the dot segment check of ADR-013 ran on the whole URL; its `$` did not match before `?` |
| A client type copied from openapi-fetch 0.17 did not take `createClient()`; a path-based client type written like openapi-fetch's failed a cast (TS2352) | TypeScript relates two conditional types only when their `extends` types are the same, and two generic mapped types only when their key remappings are the same; rc.1's `InitParam` condition (`InitOptionality<Init> extends true`) and `ClientForPath` key remapping were not openapi-fetch's |
| swr-openapi's `createQueryHook(createClient<paths>())` fails with TS2345 when openapi-fetch is installed next to this package | swr-openapi imports `Client` from `openapi-fetch`. TypeScript infers `Paths` of a generic interface only from the same declaration, so `Paths` becomes `{}`. A byte-for-byte copy of openapi-fetch 0.17's declarations fails the same way, and so do openapi-fetch 0.14 and 0.15 against 0.17's |
| `defaultBodySerializer` was declared to return `string` | it returns raw bodies unchanged, `FormData` for a multipart object, `undefined` for `undefined` |
| A body with `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` was sent as JSON; `null` and `undefined` form fields were sent as `"null"` and `"undefined"` | a strict `===` on the media type; `URLSearchParams` writes every value as text (ADR-013, decision 7 kept that) |
| Headers given as a list of pairs (`[["x-t", "1"]]`) became a header `0: x-t,1` | `mergeHeaders` read every value that is not `Headers` with `Object.entries` |
| The package description said "Only 6 kb (min)" | copied from openapi-fetch; the client is about 8.6 kB minified |

## Decision

1. **Dot segments.** `defaultPathSerializer` checks only the part of the URL before the first `?` or
   `#`. A query string or fragment in the path template is not checked: it has no segments.
2. **Client types keep openapi-fetch's shapes.** Where a public client type relates to user or
   library code, its conditional types use openapi-fetch's check and `extends` types and its mapped
   types openapi-fetch's key remapping. Fixes go into the types those shapes take:
   - `InitParam` is `RequiredKeysOf<Init> extends never ? [WithAnyKeys<Init>?] : [WithAnyKeys<Init>]`.
     The init of a union of paths stays required when one path requires one (ADR-025, decision 8,
     amended): `MaybeOptionalInit` leaves out `undefined` then, so `RequiredKeysOf` of the union is
     not `never`. Hook libraries that run their own `RequiredKeysOf<Init>` check get the same answer.
     The added keys stay a named alias: written out in both branches, `Parameters` of the methods
     was `never`.
   - `ClientForPath` maps `Pick<PathInfo, HttpMethod & keyof PathInfo>` with openapi-fetch's
     `as Uppercase<string & Method>`. `Pick` leaves out `parameters` (ADR-020) and keeps a missing
     method optional.
   - A type test (`openapi-fetch-shaped-types.test.ts`) checks a client type and a path-based
     client type copied from openapi-fetch 0.17, and hook factories in the shape of swr-openapi
     5.6.0 and openapi-react-query 0.5.4.
3. **Libraries that import openapi-fetch** need `openapi-fetch` aliased to this package
   (`overrides`, `resolutions`). No type change can make a client of another declaration fit them,
   so the docs (`docs/fetch/index.md`, the migration guide) say so and show the alias.
4. **`defaultBodySerializer`** declares its result from the body type: a raw body is its own type,
   `undefined` is `undefined`, an object is `string | FormData` with `headers` and `string` without,
   and any other value is `string`. `unknown` gives the union of all of them.
5. **Form bodies.** The form media type is matched as the multipart one is: case-insensitive, with
   or without parameters. `null` and `undefined` fields are left out, as in a multipart body (this
   amends ADR-013, decision 7, which kept `URLSearchParams`' text for them). A string or a list of
   pairs is form data already and is encoded as before.
6. **Headers.** Every `HeadersInit` form is read: `Headers` (and objects with a `get`) directly, an
   iterable of pairs through `new Headers()`, which joins a repeated name, and a record by its
   entries. `defaultBodySerializer` reads `Content-Type` through `Headers` too, so a record key in
   any letter case is found.
7. **Size.** The descriptions state the measured size. The fixes add about 0.12 kB (8.49 kB to
   8.61 kB minified), so the budget rises from 8.5 kB to 8.75 kB. Correctness ranks above size
   (CODING_PRINCIPLES §1).

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Check only the path part for dot segments (chosen) | Closes the gap; a `/../` in a template's query no longer fails | One more regular expression |
| End the dot segment pattern at `?` or `#` | Shortest change | Still reads a template's query string as segments |
| Keep rc.1's `InitParam` condition | No type change | Code written against openapi-fetch's types fails to compile |
| `InitParam` with a distributive check type over the union | The union fix stays in `InitParam` | TypeScript infers the init from the inner conditional, and the relation to openapi-fetch's condition still fails |
| Require the union init in `MaybeOptionalInit` (chosen) | `InitParam` is openapi-fetch's; library checks agree | `MaybeOptionalInit` of a union no longer includes `undefined` when one path needs an init |
| Make the client fit libraries that import openapi-fetch without an alias | Nothing for users to do | Not possible: shown with a byte-for-byte copy of openapi-fetch 0.17 |
| One `string \| FormData \| …` result for `defaultBodySerializer` | Simple | Code that used the result as `string` (openapi-fetch's type) stops compiling |
| Repeated keys for form arrays | Consistent with multipart parts | Changes what servers that read `a=1,2` get; not part of these findings |

## Consequences

- A cast or assignment to a client type copied from openapi-fetch compiles; `PARAMETERS` stays out
  of the path-based client.
- Users of swr-openapi and similar libraries add one alias to `package.json`; the compat harness
  already runs swr-openapi with the packages switched by name.
- The bundle budget is 8.75 kB.

## Review trigger

A TypeScript release that relates generic signatures across declarations; a library that types
against openapi-fetch and still fails with the alias; a server that needs form arrays as repeated
keys.
