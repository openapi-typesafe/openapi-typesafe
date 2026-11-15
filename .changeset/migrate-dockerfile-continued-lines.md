---
"openapi-typesafe-migrate": patch
---

A Dockerfile instruction continued on the next line is read as Docker reads it, with the escape
character that `# escape=` sets: a `RUN`, `CMD` or `ENTRYPOINT` continued with a backtick is
migrated, a value that ends in `\` under a backtick escape (`ENV DIR=C:\app\`) no longer hides
the next instruction, and a comment line inside a continued instruction no longer cuts it.
