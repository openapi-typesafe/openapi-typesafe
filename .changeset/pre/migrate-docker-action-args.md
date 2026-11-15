---
"openapi-typesafe-migrate": patch
---

The `args` of a GitHub Docker action (`runs.entrypoint` with `runs.args`) and of a `docker://`
step (`with.entrypoint` with `with.args`) are read as the arguments of the entrypoint, so the
old flags there are renamed. Before, they were kept and not reported.
