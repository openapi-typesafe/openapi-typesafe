---
"openapi-typesafe-migrate": patch
---

A Dockerfile exec-form item that holds a whole command line
(`CMD ["npx openapi-typescript api.yaml -it"]`, also in `RUN` and `ENTRYPOINT`) is listed to fix
by hand, with the renames it needs, as the same item of a Compose or Kubernetes list is. Before,
the tool said that there was nothing to migrate.
