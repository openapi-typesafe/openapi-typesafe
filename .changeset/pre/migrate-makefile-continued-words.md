---
"openapi-typesafe-migrate": patch
---

A Makefile `include` whose list of files a backslash continues on the next line
(`include \` and then `  tools.mk`) reads every file it names, as make does. Before, the
backslash and the line break were read as a part of the next file name, so that file was not
read and the old flags after a variable it sets were listed to fix by hand.
