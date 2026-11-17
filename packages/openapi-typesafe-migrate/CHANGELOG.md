# openapi-typesafe-migrate

## 1.0.0-rc.15

### Patch Changes

- [#168](https://github.com/openapi-typesafe/openapi-typesafe/pull/168) [`c93f348`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c93f3486c12d8d01f8af00a092cf4cceacc0f313) Thanks [@fedorello](https://github.com/fedorello)! - A Kubernetes or Compose list item that holds a whole command line
  (`args: ["npx openapi-typescript api.yaml -it"]`) is listed to fix by hand, with the renames it
  needs. Before, only a list of separate items was reported, and such an item was skipped.

- [#168](https://github.com/openapi-typesafe/openapi-typesafe/pull/168) [`c93f348`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c93f3486c12d8d01f8af00a092cf4cceacc0f313) Thanks [@fedorello](https://github.com/fedorello)! - Compose files that `docker compose` reads together are migrated together. An override file
  (`docker-compose.override.yml`, `compose.override.yaml`) whose service gets its `command` or
  `entrypoint` from the other file, a service whose `extends` names another file, and the service
  of that file it extends are listed to fix by hand with their old flags, also when only the other
  file names the package. Before, the file that did not name the package was not read, so its
  `-it` was never mentioned.

- [#168](https://github.com/openapi-typesafe/openapi-typesafe/pull/168) [`c93f348`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c93f3486c12d8d01f8af00a092cf4cceacc0f313) Thanks [@fedorello](https://github.com/fedorello)! - In a Makefile template run by `$(eval $(call TPL,a))`, `$$(GEN) $(1).yaml -it` is read as make
  reads it, as `$(GEN)`: the flags are renamed when `GEN` runs the generator. Before, the report
  named `$(1).yaml` as the program and asked to rename the flags by hand. The report of text that
  several containers share now says it may come from a YAML anchor or a Compose `extends`.

- [#168](https://github.com/openapi-typesafe/openapi-typesafe/pull/168) [`c93f348`](https://github.com/openapi-typesafe/openapi-typesafe/commit/c93f3486c12d8d01f8af00a092cf4cceacc0f313) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile is migrated together with the files it includes. `include tools.mk` with
  `GEN := npx openapi-typescript` in `tools.mk` now renames `-it` in the Makefile's
  `$(GEN) api.yaml -it`, even when the Makefile itself does not name the package. A file a Makefile
  includes is migrated as a Makefile whatever its name (`config.make`, `.env`), and a recipe in an
  included file (`mk/gen.mk`) is read with the values of the Makefile that includes it. When the
  Makefiles that include a file give a line different programs, that line is listed to fix by hand
  instead of being changed. Before, these files were left as they were, without a word.

## 1.0.0-rc.14

### Patch Changes

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Compose service now gets the `entrypoint` and `command` it does not set from the service its
  `extends` names in the same file, so the old flags of a `command` after an inherited generator
  entrypoint are renamed. A service whose `extends` names another file is reported instead.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - The files that a Compose file's top-level `include` names are now read as Compose files, relative
  to the including file and through nested includes. A service that another merged file also gives
  an `entrypoint` or `command`, a service defined again after a file that includes it (which Compose
  rejects), and an include whose file is missing, outside the project, remote or part of a cycle are
  reported instead of being changed or skipped.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Compose service that another Compose file of the same folder also gives an `entrypoint` or a
  `command` (`compose.override.yaml`, or a file given with `-f`) is now reported instead of changed:
  the container it runs depends on the files that `docker compose` merges, which the tool cannot
  tell.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A container with `args` alone (Kubernetes, or the `with` of a `docker://` step) is now reported
  when its arguments run the old generator: the image's own program runs them, which the file does
  not name, so the tool keeps them and lists the renames to make where they run the generator.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile comment that ends with a backslash now goes on over the next line, as make reads it. A
  command on that next line is part of the comment, so it is no longer renamed or reported.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile `define` block is now read as the value of its variable. A command written in the body
  of `define GEN … endef` gets the new package name and its old flags are migrated where `$(GEN)`
  runs, and lines of the body are no longer read as rules or recipes of the Makefile.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - Text that a Makefile passes to `$(eval …)` is now read as Makefile lines. A command in it gets
  the new package name instead of being reported, and values it sets for a variable make the tool
  report the old flags of that variable's commands.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile now reads the files it includes (`include`, `-include`, `sinclude`) when they are in the
  project, so a command set in an included file is migrated where the Makefile runs it. When an
  included file is missing, outside the project or named by a variable or a wildcard, the tool
  reports the old flags of the commands that it may change instead of migrating them.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile assignment indented with spaces, or with a tab before the first rule, is now read as an
  assignment, as make reads it. A command set there gets the new package name, and its old flags
  are migrated or reported where the variable runs.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile target or target-specific value whose name holds a variable (`$(TARGET): GEN = …`)
  may apply to any target, so the tool now reads it as one of the possible values of every recipe and
  reports the flags it cannot be sure of, instead of reading the recipe with the value of the file.

- [#157](https://github.com/openapi-typesafe/openapi-typesafe/pull/157) [`b1ce9e6`](https://github.com/openapi-typesafe/openapi-typesafe/commit/b1ce9e610c0ccf79ed87219b3887a3618f392edd) Thanks [@fedorello](https://github.com/fedorello)! - Options typed from the generator's parameters (`Parameters<typeof openapiTS>[1]`) keep their
  `transform` and get a note, as options typed with `OpenAPITSOptions` do: that type takes the
  TypeScript-node callbacks only, so the rewritten callbacks would not compile there.

## 1.0.0-rc.13

### Patch Changes

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A Compose service that clears an entrypoint it merges (`entrypoint: []`, `entrypoint: null`,
  `entrypoint: !reset []`) no longer gets the merged generator's flags renamed in its own
  command: `grep -it todo src` stays as written.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - The `args` of a `docker://` step or a Docker action, and a string `command` after an
  `entrypoint`, are migrated when a quoted part of them holds a blank
  (`-o "${{ github.workspace }}/schema.d.ts"`). Before, the old name and flags in them were left
  without a word.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A Dockerfile instruction continued on the next line is read as Docker reads it, with the escape
  character that `# escape=` sets: a `RUN`, `CMD` or `ENTRYPOINT` continued with a backtick is
  migrated, a value that ends in `\` under a backtick escape (`ENV DIR=C:\app\`) no longer hides
  the next instruction, and a comment line inside a continued instruction no longer cuts it.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile variable is now read as the value its lines build, in the order make reads them.
  `GEN := npx` followed by `GEN += openapi-typescript` is one command, so the old package name is
  renamed and the old flags after `$(GEN)` are migrated. A later plain assignment replaces an
  earlier value, `override` protects a value as it does in make, and values set for some targets
  apply in their recipes and in the prerequisites make builds for them. Only the branches of an
  `ifeq`/`ifdef` block, `?=` and values make computes are read as several possible values.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A container command that a YAML anchor gives to several containers (`<<: *args` or
  `command: *args`) is renamed only when all of them run it the same way. When one runs the
  generator and another runs a program of its own, the flags are kept and reported, so the other
  container keeps working.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A generator call that spreads its arguments (`openapiTS(...args)`) now gets the step to check its
  options by hand, as a call whose options come from a function or a parameter does, instead of
  being read as a call with no options.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - Text a recipe appends to a variable on a sub-make's command line (`$(MAKE) -C api GEN+=-it`,
  also with `-f`, `--directory=` and `--file=`) is now read the way make reads it: it is added to
  the value the calling Makefile exports. Its old flags are renamed when that value runs the
  generator, left alone when the called Makefile replaces the variable with `override`, and
  reported when the called Makefile is not part of the project.

- [#150](https://github.com/openapi-typesafe/openapi-typesafe/pull/150) [`9fe9d48`](https://github.com/openapi-typesafe/openapi-typesafe/commit/9fe9d4843e193c15e52b9f776e486bdb08f020a1) Thanks [@fedorello](https://github.com/fedorello)! - A Taskfile include that sets a variable for the file it includes
  (`includes: { other: { taskfile: ./other.yml, vars: { GEN: grep } } }`) is read: when it sets
  the variable to another program, `{{.GEN}} -it` in that file is no longer reported as a possible
  generator command.

## 1.0.0-rc.12

### Patch Changes

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - In a shell script that appends to a variable twice (`H+="npx openapi-typescript"`, then
  `H+=" -it"`), the appended old flag is now reported. Before, the name was renamed and `-it` was
  kept without a word, so `$H api.yaml` failed.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - A Compose `entrypoint` or `command` that a merge key gives (`<<: *gen`) is paired with the
  service's own keys, so the old flags of `command: ["api.yaml", "-it"]` after a merged generator
  entrypoint are renamed. The service's own keys win over merged ones, and the first map of a
  merge list wins over later ones. Before, the entrypoint was renamed and `-it` was kept.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - The `args` of a GitHub Docker action (`runs.entrypoint` with `runs.args`) and of a `docker://`
  step (`with.entrypoint` with `with.args`) are read as the arguments of the entrypoint, so the
  old flags there are renamed. Before, they were kept and not reported.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - Dockerfile `ENV` and `ARG` values are read as Docker reads them: escaped blanks
  (`ENV GEN=node_modules/.bin/openapi-typescript\ --redoc\ r.yaml`), several quoted parts
  (`ARG G2="npx "openapi-typescript`), escaped quotes, continued lines and the escape character
  that `# escape=` sets. The generator command in them is migrated, and the old flags after
  `$GEN` are renamed. Before, these values were neither changed nor reported.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - A file that a Taskfile includes or an Azure Pipelines template now reports the old flags after
  `{{.GEN}}` or `$(gen)` when the including file sets that variable to the generator. Before, only
  `$GEN` was reported there and the other forms kept their flags silently.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - A container command that runs the generator after an init program or an entrypoint script
  (`entrypoint: ["tini", "--"]`, `["dumb-init", "--"]`, `["docker-entrypoint.sh"]`, a Dockerfile
  `ENTRYPOINT ["/sbin/tini", "--"]`, a Kubernetes `command` with `args`) is migrated again: the
  generator name and its old flags are renamed. Before, it was only reported as a name the tool
  could not place. `tini`, `docker-init`, `dumb-init`, `catatonit`, `gosu` and `su-exec` are now
  known wrappers in every command, also by their full path.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile argument written with `:=`, `::=`, `:::=`, `?=`, `!=` or `+=`
  (`$(MAKE) -C api GEN:="npx openapi-typescript -it"`) is read as the variable it sets, as
  `GEN="…"` already was, so its command is migrated.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - The script of `sh -c` is read as the shell reads it however it is quoted
  (`sh -c 'npx openapi-typescript '"'"'a.yaml'"'"' -it'`, `sh -c "X='…'; \$X b.yaml -it"`), so
  the generator and its old flags are renamed. A flag in quotes (`"-it"`) is renamed too. A flag
  that quotes split (`-i't'`) is reported with its new name instead of kept silently.

- [#142](https://github.com/openapi-typesafe/openapi-typesafe/pull/142) [`61181e9`](https://github.com/openapi-typesafe/openapi-typesafe/commit/61181e9ec62191cb119d1ba4f8348fd1f4fbb0ea) Thanks [@fedorello](https://github.com/fedorello)! - `openapiTS(spec, undefined)` and `openapiTS(spec, void 0)` are read as a call without options.
  Before, the report asked to check the options by hand.

## 1.0.0-rc.11

### Patch Changes

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A generator command appended to a variable that the file does not set before
  (`H+="npx openapi-typescript -it"` in a shell script, `GEN += npx openapi-typescript` in a
  Makefile) is migrated where it is written. Before, it was only reported. The flags after a later
  `$H` are still reported, since the value from outside may start with another program.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - bun's `trustedDependencies` in package.json is reported when it names an old package, as pnpm's
  `onlyBuiltDependencies` already was.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - The migration reads the parameters of more CI files as it reads GitHub Actions inputs: CircleCI
  `parameters` with `<< parameters.gen >>`, GitLab `spec: inputs` with `$[[ inputs.gen ]]`, and Azure
  Pipelines template `parameters` with `${{ parameters.gen }}`. A parameter's default is renamed, and
  the old flags after or inside such a reference are reported. Each file kind reads only its own
  parameters, and `${{ inputs['flags'] }}` is read like `${{ inputs.flags }}`. Before, the flags
  after these references were kept without a word, and a GitLab input default was renamed while the
  flags after `$[[ inputs.gen ]]` were not.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - When a CI file sets a variable to the generator (GitLab `variables`, Compose `environment`,
  CircleCI `environment`, Task `vars`, Azure `variables`, a workflow `env`), the migration now also
  reads the scripts and other command files that expand it (`$GEN api.yaml -it` in
  `scripts/gen.sh`), even when they name no old package, and reports the old flags after `$GEN`
  there. Before, the variable was renamed and those flags were kept without a word.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - The old flags that a container gives the generator through its command are renamed: a
  Dockerfile `CMD ["api.yaml", "-it"]` after `ENTRYPOINT ["openapi-typescript"]` (also from an
  earlier build stage), a Compose, GitLab or CircleCI `command` after an `entrypoint`, and
  Kubernetes `args` after a `command`. Before, the entrypoint got the new name while the command
  kept `-it`, and the container failed with a removed flag. An entrypoint script that may pass its
  arguments on is reported.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - The migration renames the `options` of a GitLab CI variable together with its `value`, and reads
  each option as a value the variable can have. Before, only the value was renamed, so it was no
  longer one of the options and GitLab rejected the pipeline.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A YAML file that a Taskfile `includes`, a GitLab CI `include: local:` or an Azure Pipelines
  `template:` names is now migrated as a file of the kind that includes it, whatever its name: its
  `cmds`, `variables`, `$(gen)` macros and inputs are read as there. GitLab `*` and `**` patterns
  are followed, and so are the files that included files include. Before, such a file was read as
  plain YAML, and the report could say there was nothing to migrate.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile call of a function with a hyphen in its name, such as
  `$(filter-out x,npx openapi-typescript)`, is reported when its arguments name an old package.
  Before, the file was neither changed nor reported ("Nothing to migrate").

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A shell variable whose value is written with a backslash or in several quoted parts
  (`GEN=npx\ openapi-typescript`, `GEN="npx "openapi-typescript`) now gets the new generator name
  too. Before, the flags after `$GEN` were renamed while the value kept `openapi-typescript`, and the
  report said nothing about it.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A variable that a step, a job or a stage written as a list item sets (an Azure Pipelines or
  GitHub Actions step `env`, an Azure stage's `variables`) now counts for the commands of that item
  only. Before, it counted for the whole file, so the flags after `$GEN` in another step were
  renamed although `GEN` was not set there.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A command line passed to a program as a variable is migrated:
  `cross-env GEN="npx openapi-typescript -it" node gen.js`, `env GEN="…" make` and
  `$(MAKE) -C api GEN="…"` get the new generator name and flags. A one-word value that names an
  old package (`make GEN=openapi-typescript`) is reported. Before, both were left without a word.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A command that runs the old generator from a Windows folder outside the project
  (`C:\tools\openapi-typescript a.yaml`) is reported, as a POSIX path such as
  `/usr/local/bin/openapi-typescript` already was.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - The migration reads the command line of an exec-form shell in a YAML file as shell text:
  `command: ["sh", "-c", "…"]` in a Compose file, and a Kubernetes `command: ["/bin/sh", "-c"]`
  with the script in `args`. A Compose `entrypoint` list and `command` list, and a Kubernetes
  `command` list and `args` list, are read as one command, and Compose's `$$GEN` is read as the
  service's `$GEN`. Before, the generator and its old flags in these commands were kept without a
  word, or `$GEN` was renamed while the flags after `$$GEN` were not.

- [#134](https://github.com/openapi-typesafe/openapi-typesafe/pull/134) [`e6bbda7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e6bbda77200c0888c387ec32b8fe6d774a071aeb) Thanks [@fedorello](https://github.com/fedorello)! - A renamed dependency whose spec is Yarn's `npm:` protocol with a bare range
  (`"openapi-fetch": "npm:^0.13.0"`) gets the new version after the same protocol
  (`"openapi-typesafe-fetch": "npm:^1.0.0"`). Before, it kept the old range, which no version of
  the new package matches, and the report asked to fix it by hand.

## 1.0.0-rc.10

### Patch Changes

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - Old flags appended to a variable that holds the generator are renamed: a Makefile `GEN += -it`,
  a shell `G+=" -it"` and a justfile `"npx openapi-typescript" + " -it"`. A Makefile value that `+=`
  starts after an empty one (`CMD =`, then `CMD += npx openapi-typescript`) runs the generator, so
  the flags after `$(CMD)` are renamed too. Where the variable may also run another program, the
  appended flags are listed as a manual step. Before, they were kept without a word, and the
  migrated command failed with an unknown flag.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - The generator set in Azure Pipelines `variables` is migrated, as in a workflow `env`: a map, or a
  list of `- name: … / value: …` items, in `azure-pipelines.yml`, `*.azure-pipelines.yml`,
  `azure-pipelines-*.yml` and the files of `.azure-pipelines/` and `.azuredevops/`. A script that
  runs it as `$(gen)`, `${{ variables.gen }}`, `$GEN` or `${GEN}` gets the flags after it renamed.
  A GitLab CI list item with a `value` key under `variables` is no longer read as a variable.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - The generator set in the variables of more files is migrated, as in a workflow `env`: GitLab CI
  `variables` (also `{ value: … }`), CircleCI, Drone and Woodpecker `environment`, Docker Compose
  `environment` (a map or `NAME=value` items), and Taskfile `vars` and `env`. A Taskfile command
  that names a variable as `{{.GEN}}` gets the flags after it renamed, as after `$GEN`. Before,
  these values kept the old name, and the report could say that nothing was found.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - Old flags that a workflow step gets from an input are listed as a manual step in more forms:
  `${{ github.event.inputs.flags }}`, an `env` value `FL: ${{ inputs.flags }}` used as `$FL`, and a
  literal in an expression (`${{ inputs.flags || '-it' }}`). The flags after a shell default around
  an input (`${GEN:-${{ inputs.gen }}} e.yaml -it`) and after a shell default for a variable the
  file does not set (`${GEN:-mytool}`) are listed too. Before, these were kept without a word.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - A Kubernetes container `env` item whose value names an old package
  (`- name: GEN / value: npx openapi-typescript`) is now listed in the report as a step to do by
  hand. No shell reads such a value, so the tool does not change it. Before, it was not reported.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - The generator inside a Makefile `$(strip …)` is renamed, as inside `$(or …)` and `$(if …)`. A call
  of any other make function whose arguments name an old package (`$(firstword npx
openapi-typescript)`, `$(call …)`, `$(shell …)`) is listed as a manual step. Before, such a call
  kept the old name, and the report could say that nothing was found.

- [#126](https://github.com/openapi-typesafe/openapi-typesafe/pull/126) [`06e4e2b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/06e4e2b3a54a9bd93bf79a8949ec3c9a7be5cec8) Thanks [@fedorello](https://github.com/fedorello)! - The generator bin given by a Windows path without a suffix (`node_modules\.bin\openapi-typescript`,
  which cmd.exe runs as the `.cmd` file) is renamed to `node_modules\.bin\openapi-typesafe`, and the
  old flags after it are renamed. Before, the script was kept as it was and not reported, so it
  called a bin that the migration had removed.

## 1.0.0-rc.9

### Patch Changes

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - A shell default around a GitHub Actions expression (`${GEN:-${{ inputs.gen || 'npx
openapi-typescript' }}} api.yaml`, also with `:+`, `:=` and in `G=${G:-…}`) is migrated: the old
  name in it is renamed once, and old flags after it are listed as a manual step. Before, the tool
  skipped the whole file with "edits overlap" and exited with `1`. A report whose only findings were
  in such a skipped file no longer also says "Nothing to migrate".

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - Old flags in the default of an action or workflow input (`inputs.flags.default: --immutable-types`)
  are listed as a manual step where a command gets them as `${{ inputs.flags }}`, as for an `env`
  value used as `$FLAGS`. Before, they were not reported, and the migrated step failed.

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - Old flags in an exported justfile variable are listed as a manual step where a recipe line uses it
  as a shell variable: `export FLAGS := "-it"` used as `$FLAGS`, a parameter `$OPTS="-it"` used as
  `$OPTS`, and every variable with `set export`. Before, only `{{flags}}` was reported, and the
  migrated recipe failed.

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - The old generator inside a make function is renamed: `$(or $(GEN),npx openapi-typescript)`,
  `$(if $(GEN),$(GEN),npx openapi-typescript)` and `$(and …)`, in a recipe line or in a variable's
  value. The function may give another program, so old flags after it are still listed as a manual
  step. Before, the old name stayed, and with no flags after it the report said "Nothing to migrate".

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - The migration keeps the old flags after a variable whose program is decided when the job runs,
  and lists them as a manual step: a workflow `env` set by an expression
  (`GEN: ${{ vars.GEN || 'npx openapi-typescript' }}` or `GEN: ${{ vars.GEN }}`, used as `$GEN`), a
  Makefile `GEN ?= npx openapi-typescript`, which the environment can override, and a Makefile value
  that make computes (`GEN := $(or $(X),npx openapi-typescript)`). Before, the flags after `$GEN`
  were renamed without a word, or kept without a word, though `$GEN` may run another program.

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - A `transform` that returns an array of a one-member union (`createArrayTypeNode(
createUnionTypeNode([DATE_OR_NULL]))`, where `DATE_OR_NULL` is `Date | null`) is rewritten to
  `"(Date | null)[]"`. Before, the parentheses were lost and the type text was `"Date | null[]"`, a
  different type that still compiled.

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - The generator bin written with a Windows suffix is migrated: `openapi-typescript.cmd`,
  `openapi-typescript.ps1`, `openapi-typescript.exe` and `node_modules\.bin\openapi-typescript.cmd`
  become the same names of `openapi-typesafe`, and the old flags after them are renamed. Before, they
  were neither changed nor reported, so the script called a bin that the migration had removed.

- [#116](https://github.com/openapi-typesafe/openapi-typesafe/pull/116) [`600dd3a`](https://github.com/openapi-typesafe/openapi-typesafe/commit/600dd3afd7148146a4ec06c9400dae98a17ef3e1) Thanks [@fedorello](https://github.com/fedorello)! - Commands that a YAML anchor shares are migrated where they are written, when an alias uses them
  under a command key: a GitLab `.gen_scripts: &gen_scripts` list used as
  `script: [*gen_scripts]`, an anchored `env` map, a Taskfile command. Before, such a file was
  neither changed nor reported ("Nothing to migrate"), and the job kept running the old generator.

## 1.0.0-rc.8

### Patch Changes

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - When a bug of the tool would corrupt one file, only that file is left as it was: the report lists
  it under "Skipped" with the reason and asks you to migrate it by hand, the other files are still
  migrated (and written with `--write`), and the command exits with `1`. Before, such a bug stopped
  the whole run and nothing was migrated.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A CircleCI job now takes the `shell` of the executor it names (`executor: py` with
  `executors.py.shell: /usr/bin/python3`), so the Python code of its steps is no longer rewritten as
  a command line; a step that names an old package is listed as a manual step. The job's own `shell`
  still wins.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A Dockerfile `ARG` or `ENV` whose value has a shell default, such as
  `ENV GEN=${GEN:-npx openapi-typescript}`, no longer stops the whole migration with "Edits overlap"
  and exit code 1: the default is renamed once, like any other `ARG` or `ENV` value.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A GitLab CI job named `openapi`, `swagger`, `asyncapi`, `overlay` or `arazzo` no longer makes the
  whole `.gitlab-ci.yml` count as an API description, so its commands are migrated again. A YAML file
  counts as an API description only when such a top-level key holds a version (`openapi: 3.1.0`), and
  a CI config (`.gitlab-ci.yml`, a GitHub workflow, a CircleCI config, …) never does.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - Old flags in a justfile recipe parameter default (`b *flags='-it':` with `{{gen}} f.yaml
{{flags}}`) are now reported, like the flags of a `flags := '-it'` variable. Before, the run failed
  later with `CLI_FLAG_REMOVED`.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A Makefile command that make computes, such as `$(or $(GEN),npx openapi-typescript) b.yaml -it`,
  is now reported with the text you wrote. Before, the report showed a row of underscores instead.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A path that names the `node_modules` folder of an old package itself (`"paths": { "a":
["./node_modules/openapi-fetch"] }` in a tsconfig, or an import of `../node_modules/openapi-fetch`)
  is now reported, like a path to a file inside it.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - Options passed to `openapiTS()` that take keys from another object (`{ ...base }`) are now checked
  for legacy callbacks. When the file writes that object (`...{ transform }` or `const base = { … }`),
  its `transform`, `postTransform` and `transformProperty` are listed as manual steps; a spread of an
  object the tool cannot read (an import, a call) is listed too, so you can check it. Before, such
  options were not reported at all.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A justfile recipe whose first line is a shebang for another program (`#!/usr/bin/env python3`), and
  code given on the command line (`python3 -c '…'`, `node -e "…"`, `ruby -e '…'`), are no longer
  read as shell commands. When such code names an old package, it is listed as a manual step
  ("the script runs with python3, …"); before, it was neither changed nor reported, or a command
  line inside it was rewritten.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A rewritten `transform` whose type is declared outside the function now compiles: a TypeScript
  node type in the type of its `const` (`const transform: (s: SchemaObject) => ts.TypeNode`), in a
  JSDoc `@type` or in a JSDoc `@returns` becomes `string`, like the returns. Before, that type stayed
  and the file no longer compiled. A declared type the tool cannot map, such as a local alias, keeps
  the `transform`, which is listed as a manual step.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - A launcher or install command written with its Windows file suffix (`npx.cmd openapi-typescript`,
  `pnpm.exe exec …`, `npm.ps1 i openapi-fetch`) is now migrated like `npx`, `pnpm` and `npm`.
  Before, the old name after it was only reported.

- [#107](https://github.com/openapi-typesafe/openapi-typesafe/pull/107) [`173c82c`](https://github.com/openapi-typesafe/openapi-typesafe/commit/173c82c24fb8d59a5e3d4894596391dd48f2608f) Thanks [@fedorello](https://github.com/fedorello)! - The migration renames the old generator in GitHub Actions expressions again, such as
  `run: ${{ inputs.generator || 'npx openapi-typescript' }} api.yaml` and
  `npx ${{ inputs.pkg || 'openapi-typescript' }}`, and in input defaults of an `action.yml` or a
  reusable workflow (`default: npx openapi-typescript`). The value of an expression comes from the
  run, so old flags after it are listed as a manual step. Before, these places were neither changed
  nor reported, and npx ran the old package after the migration.

## 1.0.0-rc.7

### Patch Changes

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - A CI script now runs with the shell that CI gives it: the step's own `shell`, then the job's and
  the workflow's `defaults.run.shell` in GitHub Actions, or the job's `shell` in CircleCI. A Python
  or Node script under such a default is left and reported instead of rewritten as shell, and
  `shell: /usr/bin/env bash -e {0}`, `shell: msys2 {0}` and `shell: wsl-bash {0}` are read as bash
  again, so their commands are migrated.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - A rewritten `transform` in options of a `const` without a type (`const options = { transform }`)
  now gets `irCallbacks: true as const` (in JavaScript, `/** @type {const} */ (true)`): a plain
  `true` became `boolean` there, and the `openapiTS` call stopped compiling (TS2769). The option is
  also written before the JSDoc of `transform`, which stays with `transform`.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - An import that a JSDoc comment still names (`@param {ts.TypeNode} node`, `{@link ts.factory}`) is
  no longer removed with the rewritten `transform` returns. In a checked JavaScript file the type
  stopped resolving (TS2503).

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - A justfile variable set by an expression (`gen := env_var_or_default("GEN", "npx
openapi-typescript")`, an `if … { … } else { … }`), a recipe parameter default
  (`types gen="npx openapi-typescript":`) and a string in an interpolation get the new generator
  name again; they kept the old one without a word, and `npx` then downloaded the old generator.
  Such a value can also be another program, so the old flags after `{{gen}}` are reported.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - A local package under an old name in a workspace root (`"openapi-fetch": "file:./vendor/…"`) no
  longer keeps the imports of a workspace package that declares the npm package itself. The
  nearest manifest that declares the name decides, as Node resolves it: that package's dependency
  and its imports now both get the new name.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - The migration now renames the old generator inside a shell default value, such as
  `${GEN:-npx openapi-typescript}`, `: "${GEN:=npx openapi-typescript}"` or
  `npx ${PKG:-openapi-typescript}`. Before, these commands kept the old name and npx quietly ran the
  old package. The variable can still be set to another program outside the file, so the flags after
  such a default are listed as a manual step instead of being changed.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - The files of a split API description (`components/schemas/Job.yaml`, reached by `$ref` from
  `openapi.yaml` or `openapi.json`) and OpenAPI Overlay and Arazzo documents are data now, like the
  API description itself: their example `command` and `script` values are no longer rewritten, so
  the change no longer reaches the generated comments.

- [#101](https://github.com/openapi-typesafe/openapi-typesafe/pull/101) [`7b4ba3f`](https://github.com/openapi-typesafe/openapi-typesafe/commit/7b4ba3f783c16e506d4c9afbfe6392b1e820b1e4) Thanks [@fedorello](https://github.com/fedorello)! - The migration now lists the old flags after a variable that runs a command when it cannot see
  where the variable is set: in another GitLab `script` item, through `$GITHUB_ENV` in an earlier
  step, as `$$GEN` in a Makefile recipe, as a bash array run with `"${GEN[@]}"`, or outside the
  file. Before, flags like `-it` after such a variable were kept without a word, and the new
  generator then stopped with an unknown flag. The items of a bash array are now renamed too.

## 1.0.0-rc.6

### Patch Changes

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - An OpenAPI, Swagger or AsyncAPI document in YAML is no longer changed: an example value under a
  `command` or `script` key that mentions the generator stays as written.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - `openapi-typesafe-migrate | head` (or any reader that closes the pipe early) no longer crashes with
  an `EPIPE` stack trace and exit code 1: the rest of the report is dropped and the run ends as it
  would have.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A constant or an import that an `export { … }` list names is no longer removed with the old
  `transform` returns, so the file still compiles.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - An exported function that `transform` names is no longer rewritten: other modules may call it
  and expect TypeScript nodes. It is kept and reported as a manual step, like options that other
  code uses.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A justfile variable that holds the generator (`gen := "npx openapi-typescript"`) now has its old
  flags renamed where it runs: `{{gen}} api.yaml -it` kept `-it`. A variable of old flags that the
  generator gets (`{{flags}}`) is reported.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A dependency under an old name on a local package (`workspace:*`, `link:`, `file:`, `portal:`),
  such as a fork named `openapi-fetch` in the workspace, is no longer renamed: the new name pointed
  at a package the workspace does not have, and the install failed. The dependency and the imports
  of it keep their name, and the report lists it as a manual step.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A CI step whose `shell` is another program (`shell: python` in GitHub Actions, or a CircleCI
  `shell` next to `command`) runs code of that language, not commands. Its script is now left as it
  is and reported when it names an old package; it was skipped without a word.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A shell variable that holds the generator is migrated now. A script, a CI `run` block or a
  `package.json` script that sets `GEN="npx openapi-typescript"` (also after `export`, `local` or
  `readonly`) and then runs `$GEN api.yaml -it` was left as it was, and nothing was reported, so
  the build went on downloading the old generator. The value is renamed where it is set and the
  flags after `$GEN` where it runs, and a variable of old flags that the generator gets is reported.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - Once `openapi-fetch` is aliased to `openapi-typesafe-fetch` in the overrides (as the docs ask for
  swr-openapi), the report no longer says to update that override or to add the alias again, so a
  second run is clean. The alias counts in the `package.json` itself and in a workspace above it.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - A path in the `typesVersions` of `package.json` into the installed files of an old package
  (`node_modules/openapi-fetch/dist/index.d.ts`) is reported, as such paths in a tsconfig are: the
  new package has its own files there.

- [#93](https://github.com/openapi-typesafe/openapi-typesafe/pull/93) [`25f631d`](https://github.com/openapi-typesafe/openapi-typesafe/commit/25f631d8dabed24e18a859b08e8395496e145118) Thanks [@fedorello](https://github.com/fedorello)! - The `command` of a wireit script in `package.json` is migrated like the other scripts. It was
  neither changed nor reported.

## 1.0.0-rc.5

### Patch Changes

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A module specifier with a bundler query (`"openapi-fetch?url"`, `"openapi-fetch/x.js?raw"`) gets the
  new package name and keeps its query. Before, a query right after the package name hid the package,
  and the specifier was left as it was.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A `catalog:` dependency whose catalog entry is not in the project (`--root packages/api` of a pnpm
  workspace) keeps its name and is reported as a manual step: the entry above the root cannot be
  renamed, and renaming only the dependency failed the install with
  `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`. At a workspace root, where no catalog is above, such a
  dependency is reported as one whose entry is missing. `catalog: ` with a space is the default
  catalog, as pnpm reads it.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The generator is renamed after more programs that run it: `nice`, `timeout`, `xargs`, `command`,
  `exec -a`, `dotenvx run --`, `doppler run --`, `nx exec --`, `yarn workspace <name>`, a bare `bun`,
  `corepack`, and `tsx` or `ts-node` before the path of its binary; `yarn global add` renames its
  packages. Any other word of a command that names an old package or a path to its binary (a
  script name after `npm run`, an argument of an unknown program, `$(npm bin)/openapi-typescript`)
  is reported as a manual step. Such commands were left without a word, and
  `dotenvx run -- npx openapi-typescript` kept downloading the old generator.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The body of a here-document (`<<NOTE`, `<<'NOTE'`, `<<-NOTE`) is read as data in scripts, `run: |`
  blocks and Dockerfiles: an apostrophe in it (`Don't edit`) opened a quote to the end of the file,
  and no command after it was migrated. A here-document that a shell runs (`bash <<EOF`,
  Dockerfile `RUN <<EOF` and `RUN <<EOT bash`, `cat <<EOF | sh`) is read as the script it is, so its
  commands are migrated. A shift in an arithmetic expansion (`$((1 << 2))`) is not a here-document.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - When `transform` is rewritten to type text with `irCallbacks: true`, the options declared with
  `OpenAPITSOptions` (`const options: OpenAPITSOptions`, `satisfies` or `as OpenAPITSOptions`, a
  `transform` const typed `OpenAPITSOptions["transform"]`) name `OpenAPITSIrOptions` instead, with its
  import; the rewritten file did not compile. Options typed with a type built from `OpenAPITSOptions`
  (`Partial<OpenAPITSOptions>`) keep their `transform`, reported as a manual step. The type is found
  in the other forms it is written in too: `import("openapi-typescript").OpenAPITSOptions`, a local
  alias or an interface that extends it, and the JSDoc `@type` and `@satisfies` of a JavaScript file.
  Options that take keys from another object (`{ ...base, transform }`) keep their `transform`,
  reported as a manual step: the tool cannot see the callbacks and type of `base`. A `transform`
  written as a shorthand property (`{ transform }`) is rewritten too.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The Jest patterns that name an old package (`moduleNameMapper: { "^openapi-fetch$": … }`,
  `transformIgnorePatterns`) are reported as manual steps, in `jest.config.*` files and in the `jest`
  field of `package.json`. A pattern is not a module specifier, so the tool does not change it. A
  value of a JSON config that is just a package name (`"^@api$": "openapi-fetch"`) is reported too;
  a string of a config script that names a package (`"openapi-fetch/$1"`) is reported once.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The `import` and `export` blocks of `.mdx` files are migrated like those of a source file. Prose and
  code fences of the page stay as written.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - More files that run the generator are migrated:
  - Task's `Taskfile.yml` (`cmds`, `cmd`, `sh`, `status`, `defer`, `preconditions`);
  - pre-commit's `.pre-commit-config.yaml`: the `entry` and `args` of a hook as one command, and the
    old packages in `additional_dependencies`;
  - the `simple-git-hooks`, `lint-staged` and `nx.targets` commands of `package.json` and
    `package.yaml`;
  - `.lintstagedrc` (JSON or YAML), `.lintstagedrc.json`, `.lintstagedrc.yaml`, `.simple-git-hooks.json`;
  - the `targetDefaults` commands of `nx.json`, and the commands of Nx `configurations`.

  A YAML command written with escapes (`"openapi-typescript \"$SPEC\""`) is migrated by its value,
  and the whole string is written again with its escapes.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The import map file that a Deno config names (`"importMap": "./deps.json"`) is migrated like
  `import_map.json`, and its imports count as declared for the files under that config. An import map
  named by a URL or by a path outside the project is reported as a manual step.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - An import of a path into the installed files of an old package
  (`"../node_modules/openapi-fetch/dist/index.js"`) is reported as a manual step: the old package is no
  longer installed after the migration, so the path stops resolving.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - A patch file of an old package (patch-package `patches/openapi-fetch+0.13.0.patch`, pnpm
  `openapi-fetch@0.13.0.patch`, Yarn `openapi-fetch-npm-0.13.0-<hash>.patch`) is reported as a manual
  step: the new package has other code, so the patch cannot be carried over.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - Every package manager setting that names an old package is reported as a manual step, not only
  `overrides` and `patchedDependencies`: `packageExtensions`, `allowedDeprecatedVersions`,
  `onlyBuiltDependencies` and the rest, in `pnpm-workspace.yaml`, in the `pnpm` field of
  `package.json` and in `.yarnrc.yml`. Values count too (`"x": "npm:openapi-fetch@0.13.0"` in
  `overrides`). A setting under the `pnpm` field is reported by its own key (`pnpm.overrides`).

- [#66](https://github.com/openapi-typesafe/openapi-typesafe/pull/66) [`15344bf`](https://github.com/openapi-typesafe/openapi-typesafe/commit/15344bfb803ff9872a6d3f79b8279fbbbbfd14ea) Thanks [@fedorello](https://github.com/fedorello)! - The report shows control characters of file names and project text as escapes (`\n`, `\u001b`),
  so a file name cannot forge CI commands or erase the lines before it.

- [#69](https://github.com/openapi-typesafe/openapi-typesafe/pull/69) [`1296bd7`](https://github.com/openapi-typesafe/openapi-typesafe/commit/1296bd79e83c39598a471b9bfabf34ffcd71a83e) Thanks [@fedorello](https://github.com/fedorello)! - The targets of Node subpath imports in `package.json` (`"imports": { "#client": "openapi-fetch" }`,
  also under conditions and fallback lists) get the new package names, so they still resolve once the
  dependencies are renamed. So do the keys and values of the `browser` field
  (`"browser": { "openapi-fetch": false }`). A target or `browser` key that reaches into a file of
  the package is reported as a manual step.

- [#77](https://github.com/openapi-typesafe/openapi-typesafe/pull/77) [`decc2e2`](https://github.com/openapi-typesafe/openapi-typesafe/commit/decc2e2ae056f8a9b191d7f838056487760df530) Thanks [@fedorello](https://github.com/fedorello)! - `tsconfig.json`, `tsconfig.*.json` and `jsconfig.json` are migrated: the `compilerOptions.paths`
  keys of an old package (`"openapi-fetch"`, `"openapi-fetch/*"`) and its name in
  `compilerOptions.types` get the new names, so the paths still match the renamed imports. A path into
  `node_modules` of an old package is reported as a manual step.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

No changes in this release.

## 1.0.0-rc.0

### Minor Changes

- [`730de95`](https://github.com/openapi-typesafe/openapi-typesafe/commit/730de95d814cf9b1ec70d2b8fac6b84b17106a29) Thanks [@fedorello](https://github.com/fedorello)! - New package `openapi-typesafe-migrate`: run `npx openapi-typesafe-migrate` in a project to move it from openapi-typescript, openapi-fetch, openapi-react-query and openapi-typescript-helpers. It renames the packages in `package.json` files and pnpm catalogs, module specifiers in sources, and the generator command and its renamed flags in scripts, CI files and Makefiles. A legacy `transform` callback that returns plain `ts.factory` types is rewritten to return type text with `irCallbacks: true`. Everything it cannot change safely is listed as a manual step. It only reports until you add `--write`, and logs every finding to a JSON Lines file.

### Patch Changes

- [`e57d12b`](https://github.com/openapi-typesafe/openapi-typesafe/commit/e57d12b11b023258100cbabc5cac1d276ba5ae1f) Thanks [@fedorello](https://github.com/fedorello)! - `--help` lists the exit codes: `0` done, `1` the migration failed, `2` unknown option or argument.

- [`f0a93e4`](https://github.com/openapi-typesafe/openapi-typesafe/commit/f0a93e4094b3c69dfa8aeb229339f7d622f5cb06) Thanks [@fedorello](https://github.com/fedorello)! - The report now names only the package an override key targets: `openapi-typescript-helpers` no
  longer also reports `openapi-typescript`, and `app>openapi-fetch`, `**/openapi-fetch` and
  `openapi-fetch@0.13` keys are read as `openapi-fetch`. `overrides:` and `patchedDependencies:` in
  `pnpm-workspace.yaml` that name an old package are reported like those of `package.json`; before,
  they were neither rewritten nor reported. The output folders `.next`, `.nuxt`, `.output`,
  `.svelte-kit`, `.turbo` and `coverage` are skipped like `dist`.
