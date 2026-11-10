---
"openapi-typesafe-migrate": patch
---

More files that run the generator are migrated:

- Task's `Taskfile.yml` (`cmds`, `cmd`, `sh`, `status`, `defer`, `preconditions`);
- pre-commit's `.pre-commit-config.yaml`: the `entry` and `args` of a hook as one command, and the
  old packages in `additional_dependencies`;
- the `simple-git-hooks`, `lint-staged` and `nx.targets` commands of `package.json` and
  `package.yaml`;
- `.lintstagedrc` (JSON or YAML), `.lintstagedrc.json`, `.lintstagedrc.yaml`, `.simple-git-hooks.json`;
- the `targetDefaults` commands of `nx.json`, and the commands of Nx `configurations`.

A YAML command written with escapes (`"openapi-typescript \"$SPEC\""`) is migrated by its value,
and the whole string is written again with its escapes.
