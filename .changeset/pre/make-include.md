---
"openapi-typesafe-migrate": patch
---

A Makefile now reads the files it includes (`include`, `-include`, `sinclude`) when they are in the
project, so a command set in an included file is migrated where the Makefile runs it. When an
included file is missing, outside the project or named by a variable or a wildcard, the tool
reports the old flags of the commands that it may change instead of migrating them.
