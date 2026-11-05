---
"openapi-typesafe": patch
---

`--enum`: two enums that got one name, such as those of a property and an inline `allOf` item of
one schema, were declared twice with the same member names, and the output did not compile
(TS2300). TypeScript merges the declarations, so a later one now leaves out the members an earlier
one has, a member whose name an earlier one gives another value gets a number (`a_b_2`), and a
declaration with nothing new is left out. Output that compiled stays the same.
