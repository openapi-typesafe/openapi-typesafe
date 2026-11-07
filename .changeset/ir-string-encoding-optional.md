---
"openapi-typesafe": patch
---

`encoding` on an IR string literal is optional: a literal built without it prints as JSON text,
as the helpers print it. The Node API docs now say how to build IR (the helpers or type text)
and that a minor release may add node kinds, so a `switch` over `kind` needs a `default` branch.
