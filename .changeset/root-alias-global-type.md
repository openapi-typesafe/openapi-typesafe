---
"openapi-typesafe": patch
---

`--root-types --root-types-no-schema-prefix`: a schema named after a TypeScript global type that
the output uses, such as `Record`, got an alias of that name (`export type Record = …`). It shadowed
the global, and every `Record<string, never>` of the output failed to compile (TS2315). The alias is
now numbered like other root type conflicts (`Record_2`). An alias of a global name that the output
does not use, and output that compiled, stay the same.
