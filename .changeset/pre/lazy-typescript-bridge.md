---
"openapi-typesafe": minor
---

The TypeScript compiler is loaded only when a callback or helper uses TypeScript nodes: from the project's `typescript` (version 6 or earlier), or from `@typescript/typescript6` on TypeScript 7 projects. When neither is installed, the run fails with an error that names both packages. Legacy callbacks warn once per run: `transform` when it returns a TypeScript node, `postTransform` and `transformProperty` whenever they use the TypeScript form.
