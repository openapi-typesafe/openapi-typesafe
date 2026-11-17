---
"openapi-typesafe-migrate": patch
---

An `include` line in a Makefile is read as make reads it: its variables are expanded with the
values set before it (`include $(MK)/tools.mk` after `MK := mk`), and a wildcard
(`include mk/*.mk`) reads every project file it matches, in order. Before, such a line was not
read, so `-it` in a recipe that runs a generator set in the included file stayed unchanged.
A Makefile that includes a file the tool cannot read (missing, outside the project, or named by
a variable set outside the file, such as `-include .env`) is now read even when it names no old
package, so the old flags after a variable are reported.
