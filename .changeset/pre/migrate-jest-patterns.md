---
"openapi-typesafe-migrate": patch
---

The Jest patterns that name an old package (`moduleNameMapper: { "^openapi-fetch$": … }`,
`transformIgnorePatterns`) are reported as manual steps, in `jest.config.*` files and in the `jest`
field of `package.json`. A pattern is not a module specifier, so the tool does not change it. A
value of a JSON config that is just a package name (`"^@api$": "openapi-fetch"`) is reported too;
a string of a config script that names a package (`"openapi-fetch/$1"`) is reported once.
