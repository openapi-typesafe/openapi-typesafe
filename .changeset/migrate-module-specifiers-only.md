---
"openapi-typesafe-migrate": patch
---

Only module specifiers are renamed now: `import` and `export … from`, `import()`, `require()`,
`require.resolve()`, `import("…")` types (also in JSDoc), `declare module`, `/// <reference types>`
and the `vi` / `jest` module mocks. Before, any quoted string equal to a package name was renamed,
so an object key such as `{ "openapi-typescript": "7.13.0" }`, a label or a quoted name in a
comment was changed too. Such strings are now kept and listed under "Manual steps", and comments
are left alone. In `.vue`, `.svelte` and `.astro` files only the scripts are read, not the markup.
