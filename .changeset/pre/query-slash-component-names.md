---
"openapi-typesafe": patch
---

Remote `$ref` documents whose queries end in the same text after a `/` (a branch such as
`?ref=feature/new-api`) are each named after their own file. The pet document was named after the
owner document (`components["schemas"]["owner"]`), and the owner one `owner-2`.
