---
"openapi-typesafe": patch
---

Fix `--check` with several APIs in `redocly.yaml`: the CLI exited with `0` as soon as one output was up to date, so a stale output of another API went unnoticed. Every API is now generated or checked; each failure prints a line, and the exit code is that of the first failing API. The CLI is now TypeScript (ADR-012); it passes only the documented flags to the generator, so undocumented flags such as `--silent` no longer reach the Node API options.
