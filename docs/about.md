---
title: About openapi-typesafe
description: Where this project comes from, its goals, and the people whose work it builds on
---

<script setup>
  import Contributors from './.vitepress/theme/Contributors.vue'
  import data from './data/contributors.json';
</script>

# About openapi-typesafe

openapi-typesafe is a fork of [openapi-typescript](https://github.com/openapi-ts/openapi-typescript), with its full git history. It keeps the CLI, the Node API, the generated output and the clients of openapi-typescript 7.13, openapi-fetch 0.17 and openapi-react-query 0.5, and replaces the part that ties the generator to the TypeScript compiler API, so it works with TypeScript 7 (see [TypeScript 7](/typescript-7)).

It is not affiliated with the openapi-ts project. The original copyright notices are kept in the license files, as the MIT license requires.

## Project goals

### openapi-typesafe

1. Stay a drop-in successor: the same flags, Node API and output as openapi-typescript 7.13. Every output change is a fix with a test and a changelog entry, checked against a corpus of real-world documents.
1. Support converting any valid OpenAPI document to TypeScript types, no matter how complicated.
1. Generated types should be statically analyzable and runtime-free (with minor exceptions like [enums](https://www.typescriptlang.org/docs/handbook/enums.html)).
1. Generated types should match your original schema as closely as possible, preserving original capitalization, etc.
1. Need only Node.js to run, and no TypeScript compiler.

### openapi-typesafe-fetch

1. Types should be strict and inferred automatically from OpenAPI schemas with the absolute minimum number of generics needed.
2. Respect the native Fetch API while reducing boilerplate (such as `await res.json()`).
3. Be as light and performant as possible.

### openapi-typesafe-react-query

1. Types should be strict and inferred automatically from OpenAPI schemas with the absolute minimum number of generics needed.
2. Respect the original `@tanstack/react-query` APIs while reducing boilerplate.
3. Be as light and performant as possible.

## Security

How the generator treats documents it does not trust, and what is still open, is in the [threat model](/security/threat-model).

## Credits

openapi-typescript and openapi-fetch were created by [Drew Powers](https://github.com/drwpow), and openapi-react-query by [Martin Paucot](https://github.com/kerwanp). This project exists because of their work and the work of the more than 230 people who contributed to openapi-typescript before the fork, some of them below:

<Contributors :contributors="data.contributors" />
