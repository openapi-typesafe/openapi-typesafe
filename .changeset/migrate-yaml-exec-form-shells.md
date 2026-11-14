---
"openapi-typesafe-migrate": patch
---

The migration reads the command line of an exec-form shell in a YAML file as shell text:
`command: ["sh", "-c", "…"]` in a Compose file, and a Kubernetes `command: ["/bin/sh", "-c"]`
with the script in `args`. A Compose `entrypoint` list and `command` list, and a Kubernetes
`command` list and `args` list, are read as one command, and Compose's `$$GEN` is read as the
service's `$GEN`. Before, the generator and its old flags in these commands were kept without a
word, or `$GEN` was renamed while the flags after `$$GEN` were not.
