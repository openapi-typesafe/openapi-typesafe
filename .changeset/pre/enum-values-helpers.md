---
"openapi-typesafe": patch
---

Fix `--enum-values` output that did not compile: the `FlattenedDeepRequired` helper now flattens readonly arrays (with `--immutable`) and looks through nullable parent objects, and the `ReadonlyArray` helper accepts readonly arrays. The helper text in the generated footer changes accordingly; the exported types stay the same where they compiled before. Fixes upstream #2714, #2749, #2737.
