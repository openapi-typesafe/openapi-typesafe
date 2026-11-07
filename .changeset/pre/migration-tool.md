---
"openapi-typesafe-migrate": major
---

First release of openapi-typesafe-migrate: `npx openapi-typesafe-migrate` moves a project from
openapi-typescript, openapi-fetch, openapi-react-query and openapi-typescript-helpers. It renames
the packages in `package.json` files and pnpm catalogs, module specifiers in sources (also mocks,
JSDoc `@import` and the scripts of `.vue`, `.svelte` and `.astro` files), and the generator command
and its renamed flags in scripts, CI files and Makefiles. A `transform` callback that returns plain
`ts.factory` types becomes type text with `irCallbacks: true`. It reads only the files git lists,
never writes outside the project, and lists what it cannot change safely as manual steps. It only
reports until you add `--write`, and logs every finding to a private JSON Lines file.
