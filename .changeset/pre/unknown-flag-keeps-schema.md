---
"openapi-typesafe": patch
---

An unknown flag before the schema no longer takes the schema path as its value:
`--alphabetise api.yaml -o out.ts` prints the notice for the flag and generates `api.yaml`, where it
read stdin instead. A schema path that looks like a number (`1.10`, `0x10`) is read as written.
