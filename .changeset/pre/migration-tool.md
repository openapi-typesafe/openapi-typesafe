---
"openapi-typesafe-migrate": minor
---

New package `openapi-typesafe-migrate`: run `npx openapi-typesafe-migrate` in a project to move it from openapi-typescript, openapi-fetch, openapi-react-query and openapi-typescript-helpers. It renames the packages in `package.json` files and pnpm catalogs, module specifiers in sources, and the generator command and its renamed flags in scripts, CI files and Makefiles. A legacy `transform` callback that returns plain `ts.factory` types is rewritten to return type text with `irCallbacks: true`. Everything it cannot change safely is listed as a manual step. It only reports until you add `--write`, and logs every finding to a JSON Lines file.
