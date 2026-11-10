---
"openapi-typesafe": patch
---

The line for a written file and the notices about flags show a line break or an escape sequence in
a file name, a flag or an API name as an escape (`\n`, `\u001b`), as warnings and errors already
do, so a name cannot start a forged line in a CI log.
