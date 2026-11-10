---
"openapi-typesafe-migrate": patch
---

The import map file that a Deno config names (`"importMap": "./deps.json"`) is migrated like
`import_map.json`, and its imports count as declared for the files under that config. An import map
named by a URL or by a path outside the project is reported as a manual step.
