---
"openapi-typesafe": patch
---

A remote `$ref` or schema URL with a space or a quote before its query
(`http://host/my pet.yaml?key=…`) no longer shows the query in error messages, in lint problems
and in the `cause` of an error: a parse error of that document, a time limit, a redirect loop, a
malformed `$ref` in it or a key the loader cannot walk now name it with `?***`, as every other
message does.
