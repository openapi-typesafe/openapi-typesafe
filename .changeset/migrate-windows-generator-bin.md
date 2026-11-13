---
"openapi-typesafe-migrate": patch
---

The generator bin written with a Windows suffix is migrated: `openapi-typescript.cmd`,
`openapi-typescript.ps1`, `openapi-typescript.exe` and `node_modules\.bin\openapi-typescript.cmd`
become the same names of `openapi-typesafe`, and the old flags after them are renamed. Before, they
were neither changed nor reported, so the script called a bin that the migration had removed.
