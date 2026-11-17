---
"openapi-typesafe-migrate": patch
---

A Makefile is migrated together with the files it includes. `include tools.mk` with
`GEN := npx openapi-typescript` in `tools.mk` now renames `-it` in the Makefile's
`$(GEN) api.yaml -it`, even when the Makefile itself does not name the package. A file a Makefile
includes is migrated as a Makefile whatever its name (`config.make`, `.env`), and a recipe in an
included file (`mk/gen.mk`) is read with the values of the Makefile that includes it. When the
Makefiles that include a file give a line different programs, that line is listed to fix by hand
instead of being changed. Before, these files were left as they were, without a word.
