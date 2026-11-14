---
"openapi-typesafe-migrate": patch
---

The old flags that a container gives the generator through its command are renamed: a
Dockerfile `CMD ["api.yaml", "-it"]` after `ENTRYPOINT ["openapi-typescript"]` (also from an
earlier build stage), a Compose, GitLab or CircleCI `command` after an `entrypoint`, and
Kubernetes `args` after a `command`. Before, the entrypoint got the new name while the command
kept `-it`, and the container failed with a removed flag. An entrypoint script that may pass its
arguments on is reported.
