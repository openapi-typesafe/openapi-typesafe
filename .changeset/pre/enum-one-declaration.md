---
"openapi-typesafe": patch
---

`--enum`: a property and an inline `allOf` item of one schema that list other enum values (`mode: [a]` next to an `allOf` item with `mode: [a, b]`) share one enum, which is now declared once with every value (`enum TMode { a, b }`). The one that lists fewer values, the property or the `allOf` item, is typed by its own members (`TMode.a`), so it no longer accepts `TMode.b`; before, the enum was declared twice and TypeScript merged the two, or the later declaration was left out, so both accepted every value.
