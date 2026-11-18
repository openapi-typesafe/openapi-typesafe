---
"openapi-typesafe-migrate": patch
---

A Makefile with Windows line ends (CR LF) is read as make reads it: `include tools.mk` reads
`tools.mk`, the old flags at the end of a recipe line are renamed, and a backslash before the
line end continues the line. The file keeps its CR LF line ends. Before, the CR stayed in the
last word of each line, so the include was not read and the flags were kept without a word.
