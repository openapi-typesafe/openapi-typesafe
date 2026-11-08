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
pnpm --filter openapi-typesafe-docs build-docs            # builds the site
pnpm --filter openapi-typesafe-docs check-links           # links inside the site
pnpm --filter openapi-typesafe-docs check-external-links  # links to other sites
```

VitePress fails the build on a dead link between pages. `check-links` also checks the anchors of
the built site, and that every link into this repository names a file that exists. It requests no
other site, so it is fast and gives the same answer every time; CI runs it on every pull request.

`check-external-links` requests every link to another site, except the GitHub profiles and
avatars of the contributors on the About page. The `docs links` workflow runs it after every docs
change on main, every Monday, and on demand ([ADR-039](../adr/039-external-links-outside-pull-requests.md)).

The site URL comes from `DOCS_SITE_URL` (default: the GitHub Pages URL of the repository); its path
is the base of every link.

## Editing

All content lives in `.md` files with [VitePress Markdown extensions](https://vitepress.dev/guide/markdown).
See [CONTRIBUTING.md](./CONTRIBUTING.md).
