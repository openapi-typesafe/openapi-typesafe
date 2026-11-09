---
"openapi-typesafe": patch
---

Generated declarations no longer share a name with each other or with a global type the output
uses. Before, the output did not compile, or compiled with wrong types:

- `--enum`: an enum named like a global type that the output refers to gets a number:
  `Blob_2` with `--binary-as-blob`, whose `format: binary` fields got the enum's type, and
  `Record_2`, which did not compile next to `Record<string, never>`. The same holds for a helper
  type and for `ApiPaths` with `--make-paths-enum`. An enum named `Blob` without
  `--binary-as-blob` keeps its name.
- `--enum`: two schemas whose enum names come out the same (`status` and `Status`) were merged
  into one enum, so each accepted the values of the other. The later one gets a number
  (`Status_2`). Requests of one schema location still share one enum.
- `--root-types`: an alias that has the name of `ApiPaths`, a root interface, a
  `--read-write-markers` type or a type in `inject` gets a number too (`ApiPaths_2`).
