---
"openapi-typesafe-migrate": patch
---

Options typed from the generator's parameters (`Parameters<typeof openapiTS>[1]`) keep their
`transform` and get a note, as options typed with `OpenAPITSOptions` do: that type takes the
TypeScript-node callbacks only, so the rewritten callbacks would not compile there.
