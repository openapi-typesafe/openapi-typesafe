---
"openapi-typesafe-migrate": patch
---

A Makefile comment that ends with a backslash now goes on over the next line, as make reads it. A
command on that next line is part of the comment, so it is no longer renamed or reported.
