---
"openapi-typesafe-migrate": patch
---

Text a recipe appends to a variable on a sub-make's command line (`$(MAKE) -C api GEN+=-it`,
also with `-f`, `--directory=` and `--file=`) is now read the way make reads it: it is added to
the value the calling Makefile exports. Its old flags are renamed when that value runs the
generator, left alone when the called Makefile replaces the variable with `override`, and
reported when the called Makefile is not part of the project.
