---
"openapi-typesafe-migrate": patch
---

The Jest patterns that name an old package (`moduleNameMapper: { "^openapi-fetch$": … }`,
`transformIgnorePatterns`) are reported as manual steps, in `jest.config.*` files and in the `jest`
field of `package.json`. A pattern is not a module specifier, so the tool does not change it.
