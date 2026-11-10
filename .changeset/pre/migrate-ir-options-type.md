---
"openapi-typesafe-migrate": patch
---

When `transform` is rewritten to type text with `irCallbacks: true`, the options declared with
`OpenAPITSOptions` (`const options: OpenAPITSOptions`, `satisfies` or `as OpenAPITSOptions`, a
`transform` const typed `OpenAPITSOptions["transform"]`) name `OpenAPITSIrOptions` instead, with its
import; the rewritten file did not compile. Options typed with a type built from `OpenAPITSOptions`
(`Partial<OpenAPITSOptions>`) keep their `transform`, reported as a manual step. The type is found
in the other forms it is written in too: `import("openapi-typescript").OpenAPITSOptions`, a local
alias or an interface that extends it, and the JSDoc `@type` and `@satisfies` of a JavaScript file.
Options that take keys from another object (`{ ...base, transform }`) keep their `transform`,
reported as a manual step: the tool cannot see the callbacks and type of `base`. A `transform`
written as a shorthand property (`{ transform }`) is rewritten too.
