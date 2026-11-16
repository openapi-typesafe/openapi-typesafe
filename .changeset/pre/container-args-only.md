---
"openapi-typesafe-migrate": patch
---

A container with `args` alone (Kubernetes, or the `with` of a `docker://` step) is now reported
when its arguments run the old generator: the image's own program runs them, which the file does
not name, so the tool keeps them and lists the renames to make where they run the generator.
