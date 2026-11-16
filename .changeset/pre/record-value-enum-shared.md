---
"openapi-typesafe": patch
---

`--enum`: a record value's property (`additionalProperties`, `patternProperties`) and the object's own property of the same name share one enum again when their values are the same, also when the own property comes from an inline `allOf` item. A record value's property whose values differ from the own property's now gets its own enum (`SettingsMode_2`), so it no longer accepts the values that only the own property lists.
