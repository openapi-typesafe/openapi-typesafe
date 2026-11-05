---
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

The CommonJS declarations (`dist/index.d.cts`) now say what `require()` returns, as in
openapi-fetch and openapi-react-query they did not. For the fetch client it is
`{ default, ...named }`: `import createClient = require("openapi-typesafe-fetch")` type-checked
and then failed at runtime with "createClient is not a function"; use `.default` or a default
import. For the react-query client it is `createClient` itself; the exported types next to its
`export =` were an error (TS2309) with `skipLibCheck: false`, and are now in a namespace merged with
the function, so `import type { QueryKey } from "openapi-typesafe-react-query"` still works. Default
imports and ES modules do not change.
