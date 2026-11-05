---
"openapi-typesafe": patch
---

`--enum-values`: two different arrays that got one name, such as those of `Discount/type` and
`discount/type`, or of a property and an inline `allOf` item of one schema, declared one `const`
twice, and the output did not compile (TS2451). The later array now gets a number,
`discountTypeValues_2`. Output that compiled stays the same.
