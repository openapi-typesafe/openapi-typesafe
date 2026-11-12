---
"openapi-typesafe-migrate": patch
---

Old flags in a justfile recipe parameter default (`b *flags='-it':` with `{{gen}} f.yaml
{{flags}}`) are now reported, like the flags of a `flags := '-it'` variable. Before, the run failed
later with `CLI_FLAG_REMOVED`.
