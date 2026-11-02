---
"openapi-typesafe": patch
---

CommonJS consumers get types and a working `require()`. The package exports now carry `types` conditions (`index.d.cts` for `require`, `index.d.mts` for `import`), so TypeScript with `"module": "node16"` finds the declarations from a CommonJS file. `engines.node` is now `>=22.12.0`: the CommonJS build loads ESM-only dependencies (`parse-json`, `change-case`, `supports-color`, `yargs-parser`) through `require()`, which Node.js supports without a flag from 22.12. Fixes upstream #2047, #2155, #2342.
