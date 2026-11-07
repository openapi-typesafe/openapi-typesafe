# openapi-typesafe docs

The docs site, built with [VitePress](https://vitepress.dev/).

## Setup

With [Node.js](https://nodejs.org/en) 22 and [pnpm](https://pnpm.io/), from the repository root:

```sh
pnpm i
pnpm --filter openapi-typesafe-docs dev
```

That serves the site at `http://localhost:5173`.

## Build and check

```sh
pnpm --filter openapi-typesafe-docs build-docs    # builds the site
pnpm --filter openapi-typesafe-docs check-links
```

VitePress fails the build on a dead link between pages. `check-links` also checks anchors and
external links in the built site. The site URL comes from `DOCS_SITE_URL` (default: the GitHub
Pages URL of the repository); its path is the base of every link.

## Editing

All content lives in `.md` files with [VitePress Markdown extensions](https://vitepress.dev/guide/markdown).
See [CONTRIBUTING.md](./CONTRIBUTING.md).
