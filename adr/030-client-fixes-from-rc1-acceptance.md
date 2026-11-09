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
   - The react-query hooks use openapi-react-query 0.5.4's condition the same way
     (`RequiredKeysOf<Init> extends never`, amended 2026-11-06 after the public API audit):
     `openapi-react-query-shaped-types.test.ts` assigns `queryOptions` to a hook type copied from
     it in code generic in the paths.
3. **Libraries that import openapi-fetch** need `openapi-fetch` aliased to this package
   (`overrides`, `resolutions`). No type change can make a client of another declaration fit them,
   so the docs (`docs/fetch/index.md`, the migration guide) say so and show the alias.
4. **`defaultBodySerializer`** declares its result from the body type: a raw body is its own type,
   `undefined` is `undefined`, an object is `string | FormData` with `headers` and `string` without,
   and any other value is `string`. `unknown` gives the union of all of them. Headers written as a
   record literal (a `const` type parameter) tell the object result exactly: `FormData` for a
   `multipart/form-data` `Content-Type` in any letter case, `string` for another one or none. A
   `Headers` object, pairs or a `Record<string, …>` do not tell the media type, so they keep
   `string | FormData`.
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
| Result from the body and a record literal's `Content-Type` (chosen) | An object with written JSON or form headers stays `string`, a multipart one is `FormData` | Headers whose media type the type does not tell still give `string \| FormData` |
| Repeated keys for form arrays | Consistent with multipart parts | Changes what servers that read `a=1,2` get; not part of these findings |

## Consequences

- A cast or assignment to a client type copied from openapi-fetch compiles; `PARAMETERS` stays out
  of the path-based client.
- Users of swr-openapi and similar libraries add one alias to `package.json`; the compat harness
  already runs swr-openapi with the packages switched by name.
- The bundle budget is 8.75 kB.
- `defaultBodySerializer` breaks some code that compiled against openapi-fetch's `string`: a
  result used as a string for a raw or `unknown` body, for an object passed with a `Headers`
  object or a `HeadersOptions` variable, and in a global `bodySerializer`, whose `body` is typed
  `undefined` (openapi-fetch's `BodySerializer<unknown>`), so the result is typed `undefined`. In
  each case the body may be a raw body or a multipart object, so `string` was wrong there too. The
  global case is still not exact: its result is as wrong as the `undefined` body type it comes
  from, and typing that body `unknown` is a change of its own. The changeset and the migration
  guide name these cases.

## Amendment (2026-11-06): an empty first path segment

The security audit before 1.0.0 (B2, F9) found a gap next to decision 1. With the default
`baseUrl` `""`, `/{org}/{repo}` with `org: ""` (or `[]`, or `{}`) and `repo: "evil.example"`
gives `//evil.example`. A browser resolves that protocol-relative URL against the page to
`https://evil.example/` and sends the request there, with every header from `headers`,
`params.header` and middleware. The dot segment check did not see it: the segment is empty, not a
dot. openapi-fetch 0.17 builds the same URL.

1. `defaultPathSerializer` throws `Empty first path segment in …` when the path part of its result
   (before `?` or `#`) starts with `//`, as it throws for a dot segment. A custom `pathSerializer`
   is not checked (ADR-013, decision 2).
2. Empty values stay allowed everywhere else: RFC 6570 allows them, and `/acme/` or `/a//x` name a
   path on the same host.
3. The check does not depend on `baseUrl`. With an absolute one the result is a path
   (`https://api.example//evil.example`), but an empty first segment is a bug in the caller there
   too, and the serializer does not know the base. (Corrected on 2026-11-08, see below: the
   serializer gets the base in front of the template, so the check did depend on it.)

| Option | Pros | Cons |
| --- | --- | --- |
| Reject a result that starts with `//` (chosen) | Closes exactly the shape that changes the host; no other empty value changes | A template that itself starts with `//` (not a valid path) rejects too |
| Reject every empty path value | Simple to state | RFC 6570 allows empty values; `/files/{dir}/` style calls that work today would reject |
| Reject only when `baseUrl` is relative | No change with an absolute base | The serializer does not see the base; `createFinalURL` would need a second check |
| Encode an empty first value as `%2F` or similar | No error | Sends a request to a path no server expects; hides the caller's bug |

## Amendment (2026-11-08): the checks look only at what the parameters write

Decision 3 of the amendment above was false. `createFinalURL` passes `baseUrl` and the template
joined (`//api.example.com/v1/users/{id}`) to the path serializer, as openapi-fetch 0.17 does, so
the checks saw the base. The bug hunt on rc.3 (`RC4_BUGS.md`, item F1) found that a
protocol-relative `baseUrl` (`//api.example.com/v1`, common in pages served over HTTP and HTTPS)
made every call with `params.path`, even an empty one, throw `Empty first path segment`, and a
base with a `.` or `..` segment threw `Dot path segment`. openapi-fetch sends these requests.

1. `defaultPathSerializer` checks only the path part (before `?` or `#`) from the segment of the
   first parameter on. The text before the first parameter is the `baseUrl` and the template; no
   value changes it, so it is not checked. A dot segment that a value completes in that segment
   (`/books/.{id}` with `id: ""`) is still found.
2. The empty first segment check throws only when the result starts with `//` and the fixed text
   before the first parameter does not: then a value made the `//`.
3. A template without parameters is returned as it is: no value can move it.
4. The serializer keeps its input, the base and the template joined. Passing only the template
   would change what a custom `pathSerializer` gets from openapi-fetch's contract, and a base
   with a `{name}` placeholder would no longer be filled.
5. The checks moved to a helper, so `defaultPathSerializer` loses its ADR-036 suppression.

| Option | Pros | Cons |
| --- | --- | --- |
| Check from the segment of the first parameter on (chosen) | Exactly the text values can change; same input as openapi-fetch | A literal dot segment in the template after the first parameter still throws, as before |
| Serialize only the template, then add `baseUrl` | The serializer never sees the base | A custom `pathSerializer` gets other input than in openapi-fetch; a templated base breaks |
| A third argument with the base length | Exact | Changes the public `PathSerializer` signature |

## Amendment (2026-11-07): one conditional type for `MaybeOptionalInit`

The full compat run before rc.2 (audit B5) found that permit-cli, which type-checks with
openapi-fetch 0.17, failed with 11 errors TS2322. Its wrappers are generic in the path, call
`client.GET(path, init)` and return the result as `FetchResponse<paths[Path]["get"], Init,
"application/json">`. The init cannot be checked against a generic path, so TypeScript gives the
call the init type `MaybeOptionalInit<paths[Path], "get">`.

Decision 2 wrote that type as a union, `FetchOptions | (RequiredKeysOf<…> extends never ?
undefined : never)`. `ParseAsResponse` in `FetchResponse` distributes over its options, so the
call's `data` became a union too, of members that TypeScript could not relate to the wrapper's
generic `FetchResponse`. openapi-fetch's `MaybeOptionalInit`, and ours in
rc.1, is one conditional type: it stays deferred, and TypeScript relates the two `ParseAsResponse`
types by their check types.

1. `MaybeOptionalInit` is openapi-fetch's conditional over the distributive init of decision 2:
   `RequiredKeysOf<Inits> extends never ? Inits | undefined : Inits`. The init of a union of paths
   stays required when one path requires one.
2. The methods keep `PathOperation<Paths, Path, Method>` in their result. `Paths[Path][Method]` is
   not valid while `Paths` is only `{}` (upstream #2267), and with the conditional above the result
   relates to `FetchResponse<Paths[Path][Method], …>` as in rc.1.
3. `generic-wrapper-responses.test.ts` checks wrappers in permit-cli's shape for every method,
   `request()`, and a media type of their own.

| Option | Pros | Cons |
| --- | --- | --- |
| One conditional type (chosen) | openapi-fetch's shape; generic wrappers relate again; the union rule stays | none found |
| `Paths[Path][Method]` in the method result | upstream's expression | needs `Paths extends Record<…>`, which brings back TS2344 (upstream #2267); the union still distributes |
| Keep the union | no change | code written against openapi-fetch fails to compile |

## Amendment (2026-11-09): `FetchOptions` distributes over operations

The type hunt before rc.4 (T2) found that wrappers generic in the path that type the init as
`FetchOptions<FilterKeys<paths[P], "get">>` or `FetchOptions<paths[P]["get"]>` failed with TS2345
in `client.GET` and in `useQuery`, `queryOptions` and `useSuspenseQuery`, on TypeScript 5.4 to 7.0.
openapi-fetch 0.17 compiles them. The client's init per operation was a distributive alias of its
own, `Operation extends unknown ? FetchOptions<Operation> : never`. TypeScript relates a type to a
conditional type only when that conditional type does not use its check type in its branches, so
no `FetchOptions` of a generic path was assignable to it.

1. `FetchOptions<T>` itself distributes: `T extends unknown ? RequestOptions<T> & Omit<…> : never`.
   The client's init of a generic path and the wrapper's type are then the same type, and the outer
   `RequiredKeysOf<…> extends never` condition, which does not distribute, relates to it through
   both of its branches.
2. For one operation `FetchOptions` is unchanged. For a union of operations it is the union of
   their inits, as the client's init already was (ADR-025, decision 8); `FetchOptions<never>` is
   `never`. The init rules of decision 2 and of the amendment above stay; their tests are unchanged.
3. `fetch-options-wrappers.test.ts` in the fetch and react-query packages and `generic-wrappers.ts`
   in the type matrix check these wrappers.

| Option | Pros | Cons |
| --- | --- | --- |
| `FetchOptions` distributes (chosen) | Wrappers relate on every TypeScript; one init per operation stays; no change in check cost on the GitHub and Stripe schemas | `FetchOptions` of a union is a union, not one merged object type |
| A mapped type over the paths in the method constraint | `FetchOptions` stays as in openapi-fetch | `MaybeOptionalInit` of a union of path items cannot be mapped by key; two init types to keep in step |
| Back to openapi-fetch's one `FetchOptions` of the union | openapi-fetch's type | Brings back TS2589 on hundreds of paths (upstream #1882) |

## Amendment (2026-11-09): a hole of an array field

The second runtime hunt before rc.4 found that a hole of an array field was dropped in a form
body: `{ a: [, 1] }` gave `a=1`, while `{ a: [null, 1] }` gave `a=%2C1` (`,1`). The items came
from `[value].flat()`, which skips holes. A hole is now an `undefined` item (`Array.from`), as
`Array.prototype.join` and `URLSearchParams` read it: an empty item in a form body, left out in a
multipart body, which leaves out `null` and `undefined` items. Both bodies take their items from
one function, `formItems`.

## Review trigger

A TypeScript release that relates generic signatures across declarations; a library that types
against openapi-fetch and still fails with the alias; a server that needs form arrays as repeated
keys.
