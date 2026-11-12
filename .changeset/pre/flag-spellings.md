---
"openapi-typesafe": patch
---

A flag written in another case or with `_` (`--Enum`, `--ALPHABETIZE`, `--root_types`,
`--enum-Values`, `--Output`) is an unknown flag: it takes no value, changes nothing, and the notice
names it as you wrote it. It used to take the schema path as its value and read stdin, and the notice
named the known flag (`Unknown flag --enum is ignored`). The kebab-case and camelCase spellings
(`--root-types`, `--rootTypes`) work as before.
