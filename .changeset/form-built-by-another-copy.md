---
"openapi-typesafe-fetch": patch
---

A `FormData` that `defaultBodySerializer` built gets the platform's boundary also when another
copy of the package built it, such as the CommonJS build next to the ES module build in one
application. A `bodySerializer` that wrapped the default one of the other build kept a boundary
set by hand, and the server could not split the parts. The form is marked with the registered
symbol `Symbol.for("openapi-typesafe-fetch/form")`, which is not a form field.
