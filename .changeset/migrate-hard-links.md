---
"openapi-typesafe-migrate": patch
---

`--write` no longer changes a file outside the project through a hard link. Each file is now
written as a new file in the same folder and renamed over the old one, with the old file's mode:
the project file gets the change, and another hard link to it keeps its old text (the log notes
it). A run that fails half way no longer leaves a half-written file.
