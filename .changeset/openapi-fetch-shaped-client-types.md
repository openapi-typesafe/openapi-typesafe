---
"openapi-typesafe-fetch": patch
---

Client types written against openapi-fetch's accept this client again: a client type copied from
openapi-fetch 0.17 takes `createClient()`, and a path-based client type written like openapi-fetch's
takes `wrapAsPathBasedClient()` with a cast (TS2352 before). The init parameter uses openapi-fetch's
condition again, and the path-based client leaves out `PARAMETERS` without its own key remapping.
For a union of paths, `MaybeOptionalInit` no longer includes `undefined` when one of the paths
requires an init, so hook libraries that check the init themselves (swr-openapi,
openapi-react-query) require it too. Libraries that import `openapi-fetch` need it aliased to this
package; see "Libraries built on openapi-fetch" in the docs.
