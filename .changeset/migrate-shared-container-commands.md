---
"openapi-typesafe-migrate": patch
---

A container command that a YAML anchor gives to several containers (`<<: *args` or
`command: *args`) is renamed only when all of them run it the same way. When one runs the
generator and another runs a program of its own, the flags are kept and reported, so the other
container keeps working.
