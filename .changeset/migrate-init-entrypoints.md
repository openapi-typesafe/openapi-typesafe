---
"openapi-typesafe-migrate": patch
---

A container command that runs the generator after an init program or an entrypoint script
(`entrypoint: ["tini", "--"]`, `["dumb-init", "--"]`, `["docker-entrypoint.sh"]`, a Dockerfile
`ENTRYPOINT ["/sbin/tini", "--"]`, a Kubernetes `command` with `args`) is migrated again: the
generator name and its old flags are renamed. Before, it was only reported as a name the tool
could not place. `tini`, `docker-init`, `dumb-init`, `catatonit`, `gosu` and `su-exec` are now
known wrappers in every command, also by their full path.
