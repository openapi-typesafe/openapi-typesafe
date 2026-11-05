---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "openapi-typesafe"
  tagline: OpenAPI 3.x to TypeScript types, and a type-safe fetch client. A drop-in successor to openapi-typescript and openapi-fetch that works with TypeScript 7.
  actions:
    - theme: brand
      text: Get Started
      link: /introduction
    - theme: alt
      text: Migrate from openapi-typescript
      link: /migration-guide
    - theme: alt
      text: View on GitHub
      link: https://github.com/openapi-typesafe/openapi-typesafe

features:
  - title: Runtime-free types
    details: Static TypeScript types add nothing to your bundle. The fetch client is a few kilobytes and wraps the native Fetch API.
  - title: TypeScript 7 ready
    details: The generator prints types itself and needs no TypeScript compiler, so it runs next to TypeScript 7 or any earlier version.
  - title: Drop-in
    details: The same CLI flags, Node API and output as openapi-typescript 7.13, checked byte for byte against openapi-typescript 7.13 on a corpus of real-world schemas. One command moves a project.
---
