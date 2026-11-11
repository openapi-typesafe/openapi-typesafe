---
"openapi-typesafe": patch
---

Warnings and errors on stderr get colors only when stderr is a terminal. A log file that stderr
was redirected to got color escape sequences whenever stdout was a terminal.
