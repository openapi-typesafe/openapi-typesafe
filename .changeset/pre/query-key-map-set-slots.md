---
"openapi-typesafe-react-query": patch
---

A query key tells a `Map` or a `Set` by what it really is, not by its type tag. A class of yours
whose tag says `Set` or `Map` while its data is in its own members (and that does not iterate
its contents) was keyed as an empty collection, so two requests with different data shared one
cache entry; it is now keyed by its own members, as JSON sends it. A `Map` or a `Set` made in
another realm (an iframe, `node:vm`, a Jest environment) keeps its own members in the key beside
its contents, as one of this realm does. MobX observable maps and sets keep their keys.
