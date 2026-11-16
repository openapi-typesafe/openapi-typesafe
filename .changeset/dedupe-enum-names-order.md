---
"openapi-typesafe": patch
---

`--fix dedupe-enum-names`: two enums with other values whose best names are the same (`Pet` and `Pet-` both give `PetState`) now get their names by their values, as documented: moving the schemas in the document no longer swaps `PetState` and `PetState_2`.
