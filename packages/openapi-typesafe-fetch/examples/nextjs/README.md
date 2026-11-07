# openapi-typesafe-fetch + Next.js

Example of using openapi-typesafe-fetch in [Next.js](https://nextjs.org) using server-rendered data.

For an example of fetching clientside, see [openapi-typesafe-react-query](https://openapi-typesafe.github.io/openapi-typesafe/react-query/) which also works in Next.js (React Query is recommended over SWR because of type inference).

## Run it in this repository

The example is part of the openapi-typesafe monorepo: its `package.json` uses `workspace:^` and
`catalog:` versions, so it runs against the packages built from this repository. From the
repository root:

```sh
pnpm install
pnpm build
pnpm --filter @example/openapi-typesafe-fetch-nextjs dev
```

You’ll see the server running at `localhost:3000`

## Copy it into your own project

Outside this repository `workspace:^` and `catalog:` do not resolve. In `package.json`, replace
them with published versions:

- `openapi-typesafe-fetch` and `openapi-typesafe`: `workspace:^` → `^1.0.0-rc`
- `typescript`: `catalog:` → `^6.0.3`

Then install with your package manager and run `npm run dev`. To regenerate the types from the
schema, run `npx openapi-typesafe lib/api/v1.json -o lib/api/v1.d.ts`.
