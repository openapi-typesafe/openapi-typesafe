---
"openapi-typesafe": minor
---

Add `--no-lint` (CLI) and `lint: false` (Node API, and `x-openapi-ts` per API) to skip the Redocly lint step. Bundling errors still fail the run. Lint stays on by default. Closes upstream #2840 (design of upstream PR #2845).
