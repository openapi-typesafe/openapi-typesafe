---
"openapi-typesafe": patch
---

The declarations type-check in a CommonJS project without `esModuleInterop` (`module: commonjs`,
`moduleResolution: node`, `skipLibCheck: false`). The exported `c` was declared with a default
import of `ansi-colors`, which TypeScript reported as error TS1259.
