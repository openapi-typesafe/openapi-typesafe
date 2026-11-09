---
"openapi-typesafe-migrate": patch
---

When `transform` is rewritten to type text with `irCallbacks: true`, the options declared with
`OpenAPITSOptions` (`const options: OpenAPITSOptions`, `satisfies` or `as OpenAPITSOptions`, a
`transform` const typed `OpenAPITSOptions["transform"]`) name `OpenAPITSIrOptions` instead, with its
import; the rewritten file did not compile. Options typed with a type built from `OpenAPITSOptions`
(`Partial<OpenAPITSOptions>`) keep their `transform`, reported as a manual step. A `transform`
written as a shorthand property (`{ transform }`) is rewritten too.
