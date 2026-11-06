# openapi-typesafe-fetch + Svelte/ SvelteKit

Example of using openapi-typesafe-fetch in [Svelte](https://svelte.dev/docs/svelte/overview) / [SvelteKit](https://svelte.dev/docs/kit/introduction).

- [Svelte or clientside SvelteKit example](./src/routes/+page.svelte)
- [SvelteKit page data example](./src/routes/page-data/+page.svelte)

## Run it in this repository

The example is part of the openapi-typesafe monorepo: its `package.json` uses `workspace:^` and
`catalog:` versions, so it runs against the packages built from this repository. From the
repository root:

```sh
pnpm install
pnpm build
pnpm --filter @example/openapi-typesafe-fetch-sveltekit dev
```

You’ll see the server running at `localhost:5173`

## Copy it into your own project

Outside this repository `workspace:^` and `catalog:` do not resolve. In `package.json`, replace
them with published versions:

- `openapi-typesafe-fetch` and `openapi-typesafe`: `workspace:^` → `^1.0.0`
- `typescript`: `catalog:` → `^6.0.3`, and `vite`: `catalog:` → `^8.3.5`

Then install with your package manager and run `npm run dev`. To regenerate the types from the
schema, run `npx openapi-typesafe src/lib/api/v1.json -o src/lib/api/v1.d.ts`.
