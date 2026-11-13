# ADR-015: The migration tool parses sources with `@typescript/typescript6`

- Status: Accepted
- Date: 2026-11-02

## Context

`openapi-typesafe-migrate` (ENGINEERING_PLAN 10.1) rewrites the legacy `transform` callback of
`openapiTS()` calls: a `ts.factory` type that it returns becomes TypeScript type text, and
`irCallbacks: true` is added. The rewrite must know where an options object, a function body and a
returned expression start and end. A regular expression cannot tell a returned `ts.factory` call from
one in a nested function, or follow a module constant; a parser can.

The `typescript` package's latest release is 7.x, which has no JavaScript API. TypeScript 6 is
published for tools as `@typescript/typescript6` (6.0.2, a wrapper of `typescript@^6`, about 23 MB
installed). The generator itself already treats it as the optional TypeScript-node bridge (ADR-004).

## Decision

1. The migration tool has one runtime dependency, `@typescript/typescript6` (`^6.0.2`). It is used
   only by `src/adapters/typescript-parser/`, behind the `CallbackRewriter` and
   `SourceStringScanner` ports; dependency-cruiser fails the lint if another module imports it.
2. The parser only reads: edits are offsets into the original text, so formatting and comments
   outside the replaced expressions stay as written.
3. The parser also finds the module specifiers that the package rename changes (imports, exports,
   `import()`, `require()`, `import("…")` types and `@import` tags in any JSDoc block,
   `declare module`, `/// <reference types>`, the module methods of vitest, jest and bun). A string that equals a package name in any other place is reported, not renamed: only
   the syntax tells a module specifier from a label or an object key.
4. A callback is rewritten only when every return is a known type-building form (references,
   keywords, literal types, unions, intersections, arrays, the helper constants, module constants
   bound to these). Anything else is left and reported as a manual step.

## Alternatives

| Option                                   | Pros                                                              | Cons                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `@typescript/typescript6` (chosen)       | Full TypeScript and JSX syntax; same AST the legacy callbacks use | 23 MB install for a one-time `npx` run                                    |
| Regular expressions                      | No dependency                                                     | Cannot find returns or scopes; would corrupt code it does not understand  |
| `typescript` 7                           | Current compiler                                                  | No JavaScript API                                                         |
| A smaller parser (Babel, oxc, swc)       | Smaller or faster                                                 | Another AST to learn, and TypeScript syntax lags behind TypeScript itself |
| No automatic rewrite (manual guide only) | No dependency                                                     | Scope-cut (2) of the plan; every legacy user does it by hand              |

## Consequences

- `npx openapi-typesafe-migrate` downloads TypeScript 6 once; the tool is not a dependency of any
  project, so the size does not reach users' installs.
- Single-file components (`.vue`, `.svelte`, `.astro`) get the specifier rename in their
  `<script>` blocks (and Astro's frontmatter), but no callback rewrite; their markup is not read.
  `<script>` blocks are looked for after the frontmatter only, so the two never overlap, and the
  rename refuses strings that overlap instead of writing a name twice.

## Amendment (2026-11-06): which files the tool reads

The tool reads the files that git lists (`git ls-files --cached --others --exclude-standard`), so
build output that `.gitignore` ignores is not rewritten. A review of that change found three gaps,
each of which skipped files without a word:

- In a folder that an outer repository ignores, git lists nothing, and the migration said there
  was nothing to change.
- Git lists a submodule, or a repository nested in the working tree, as one entry. That entry is
  a directory, not a file, so the files in it were left out; the tree walk used to read them.
- A file in a merge conflict was listed once per side.

Decision: the git listing is used only when `git check-ignore` says that the folder itself is not
ignored; otherwise the folder's tree is walked. `--deduplicate` lists each file once (git 2.31;
an older git fails the listing, and the tree is walked). Every directory that git lists as one
entry is listed by the same rule, by the git of that directory: its own repository, its own
`.gitignore`, or a tree walk when git cannot list it. `--recurse-submodules` was not used: it
works only for tracked files of submodules, not with `--others`, and not for nested repositories
that are not submodules. The log records, for each folder, whether git or the tree walk listed it.

## Amendment (2026-11-06): the project tree is not trusted

A security review found that the tool trusted more of the project folder than its own sources.
A project can hold files that its user did not write or check: a folder unpacked from an archive,
a repository committed inside a cloned one, a dependency vendored with its own `.git`. The tool
now treats the tree as untrusted input:

- **Git config of nested repositories.** Git reads the config of the repository it runs in, and
  `core.fsmonitor` in that config is a command that `ls-files` and `check-ignore` run. A planted
  `.git/config` ran code in a dry run. Every git command now gets `-c core.fsmonitor=false -c
safe.bareRepository=explicit`; command-line settings win over every config file. Checked by
  hand on git 2.54: these two commands write no index (so no hook runs) and start no filter,
  pager or network helper, so `core.fsmonitor` is the only command they take from config. An
  embedded bare repository is refused (`--root` pointed at one), and that folder is walked as a
  tree. `-c` is used, not `GIT_CONFIG_PARAMETERS`, so the settings are visible in the arguments.
  System and global config stay: the user and the administrator wrote them.

- **Paths from a foreign git index.** Git checks a path when it adds it to the index, but it
  prints an index that it did not write as it is. A planted index listed `../../outside/a.ts`, and
  `--write` changed that file. A listed path is now used only when it has no `..` segment, is not
  absolute, and its real path (links resolved, parent folders too) is inside the real path of the
  root. Other paths are not read; the report lists them under "Skipped" and the log has a
  `file_skipped` warning for each, because such an index is a sign of a planted repository.
  `read` and `write` check the real path again, so no caller can reach outside the root.

- **Hard links.** `writeFile` writes into the same inode, so a project file hard-linked to a file
  outside the root (an archive can hold such links) changed that file too. Two fixes were
  weighed: skip a file with more than one link and report it, or write a new file and rename it
  over the old one. The tool renames: the user asked for the project file to change, and it does;
  the other link keeps its old text, and the log has a `hard_link_separated` warning. The rename
  also never writes through a link that appears after the listing, and a failed run leaves the
  old file whole. The new file gets the old mode; it is owned by the user who runs the tool, and
  the folder must be writable. A leftover temporary file is not overwritten (`wx`); the error
  names it.

- **Credentials in specs.** A dependency spec such as `git+https://<token>@github.com/…` was
  copied into the report and the log. The findings now hide the userinfo of every URL
  (`https://***@host/…`), in kept specs and in the JSON parse error of a `package.json`; the
  files keep the spec as written. The scan is a loop over `://`, not a regular expression, so it
  stays linear.

- **The default log file.** It was `<tmpdir>/openapi-typesafe-migrate/<time>.jsonl`: a fixed
  folder that another user of a shared `/tmp` could create first, and a name they could guess and
  plant a link at. The folder now comes from `mkdtemp` (a random name, mode 0700), and the file
  is created with `wx` (`O_CREAT | O_EXCL`, mode 0600), which refuses an existing path, a link
  included. A `--log` path is the user's choice: it is appended to, as before, and created with
  mode 0600.

- **Slow patterns.** Three regular expressions took time quadratic in their input: `<script>`
  blocks (a lazy body rescanned from every unclosed tag; 6.8 s on a crafted 640 kB `.vue`), and
  the catalog entry and override key patterns of `pnpm-workspace.yaml` (10 to 15 s on a 160 kB
  line). Script blocks are now found by searches from left to right that never go back. The entry
  pattern no longer ends in `(.*)$` (the rest of the line is what follows the match), and an
  override key must start after the indent (`\S`), so the indent and the key cannot split the
  same spaces. recheck reports the new patterns as safe; tests bound the time on large input.
  A YAML parser was not added then: the file was edited line by line so that comments and
  formatting stayed. The amendment "package names in structured files" below replaces that.

## Amendment (2026-11-08): commands are parsed, names are resolved by scope

A review of rc.3 found that the tool matched text where it needed structure:

- **Commands.** The generator command and its flags were renamed by regular expressions on each
  line: the flags of every command on a line with the generator changed (`docker run -it` became
  `docker run --immutable`), flags on a line continued with `\` did not change, and the old name
  changed wherever it followed a blank, so `npm run openapi-typescript` (a script) and an OpenAPI
  `description` in a YAML file were renamed too. The domain now splits shell text into simple
  commands and words by the POSIX rules (quotes, escapes, continuations, comments, control
  operators, quoted command lines such as `sh -c "…"`), without expanding anything. A table of
  launchers (`npx`, `pnpm exec`, `cross-env`, `node`, `docker run`, …) and install subcommands
  tells the program word and the package words apart; only the generator's own arguments get the
  flag renames, and only package words get package renames. A pinned version is reported.
- **Files with commands.** YAML files change only in command keys (`run`, `script`, `command`,
  …) and Dependabot names; JSON configs (Nx `project.json`, `deno.json`) only at command paths,
  each string replaced in place, so formatting and comments stay. Both formats are read by real
  parsers behind ports (`JsonDocumentReader`, `YamlDocumentReader`), which give each string value
  its key path and its offsets in the text; the domain decides which values are commands and
  edits only those ranges, and nothing is printed back by a library. JSON and JSONC are read with
  the TypeScript JSON parser (`parseJsonText`, the one tsc reads `tsconfig.json` with; it accepts
  comments and trailing commas), so no dependency is added for them. YAML is read with `yaml`
  (eemeli/yaml, `^2.9.1`, a caret range as ADR-003 sets for libraries), with its source tokens,
  so plain, quoted and block scalars and flow collections (`run: [a, b]`, `{run: x}`) all have
  exact offsets, and multi-document streams are read. A hand-written scanner was rejected: it
  read only the block style and drifted from the grammar at its edges. A config that does not
  parse and names an old package is reported. A list value of `command` or `entrypoint` is one
  command in exec form (Compose, Kubernetes): each item is one word. The catalogs of
  `pnpm-workspace.yaml` move onto the same readers in the amendment "package names in structured
  files" below.
- **Names in `transform` callbacks.** A returned `DATE` was looked up by its spelling among the
  module constants, so a local `const DATE` in the callback was rewritten with the module's type.
  Names are now resolved with the checker of a one-file program (no default library, no module
  resolution, a host that reads no file), so each identifier refers to the declaration in its
  scope. The same resolution finds options passed as a `const`, the generator through a
  namespace import, and the module constants and imports that the rewrite leaves unused; those
  are removed so that `noUnusedLocals` passes, and only when their initializer builds a type, so
  no side effect is lost.

## Amendment (2026-11-09): git never fetches

The rc.4 review (finding S1) proved the first amendment wrong: `core.fsmonitor` is not the only
command that `ls-files` and `check-ignore` take from config. A planted partial clone with a
sparse index holds a directory entry whose tree object is missing; reading the index fetches
that tree from the promisor remote, and the fetch runs the repository's `core.sshCommand` (an
`ext::` remote or a credential helper would run a command the same way). It ran in a dry run.

Decision: every git command also gets `-c protocol.allow=never`, which refuses every transport
on every git version, and the environment variable `GIT_NO_LAZY_FETCH=1`, which makes git 2.45
and newer not try a fetch at all (`GIT_TERMINAL_PROMPT=0` too, so nothing waits on a prompt).
Two settings, because each one alone depends on git: the variable is ignored by an older git,
and the `-c` setting relies on every fetch going through a transport. Git then reports the
missing object on stderr and lists the files it can read. A test plants such a repository and
checks that no command ran, also with `GIT_NO_LAZY_FETCH=0` in the environment. The environment
is passed to the git adapter by the composition root, not read inside it.

This decision was wrong in one point, which the next amendment corrects: `protocol.allow=never`
does not refuse every transport, because a repository's `protocol.<name>.allow` wins over it.

## Amendment (2026-11-09): the second review of the migration tool

A second review of the fixes above found these gaps.

- **The transport guarantee did not hold on git older than 2.45.** A planted
  `protocol.ssh.allow=always` (or `protocol.file.allow`) beats `-c protocol.allow=never`, and git
  before 2.45 ignores `GIT_NO_LAZY_FETCH`, so on git 2.39 the lazy fetch still ran the planted
  `core.sshCommand`. Decision: git also gets `GIT_ALLOW_PROTOCOL=""` in its environment. Since
  git 2.12 this variable, when set, is the whole list of allowed transports and overrides every
  `protocol.*` key, so an empty list refuses all of them on every git the tool supports (2.31 and
  newer). The other settings stay as a second layer. Checked with the proof repositories on git
  2.39.3 and 2.54.0, and by a test that plants `protocol.ssh.allow=always` and
  `protocol.file.allow=always` and drops `GIT_NO_LAZY_FETCH`.
- **Git was found by a bare name.** On Windows a bare `git` with the project as the working
  folder can start a `git.exe` from that folder. The adapter now looks git up itself: the first
  absolute folder of `PATH` (`Path` on Windows, by any case) that holds an executable `git`
  (`git.exe` on Windows), and runs that path. Relative and empty entries of `PATH` are skipped.
  The lookup takes the environment, the platform and a small file system port, so tests run it
  with an in-memory one. Without a git found, the folder is walked as a tree.
- **A planted `core.worktree` or an inherited `GIT_DIR` changed what git listed.** The first made
  the listing empty, the second (set by git hooks) made every folder list one repository. The
  folder that holds the nearest `.git` is now given as `GIT_WORK_TREE`, which wins over
  `core.worktree`, and the variables that name a repository (`GIT_DIR`, `GIT_WORK_TREE`,
  `GIT_COMMON_DIR`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
  `GIT_ALTERNATE_OBJECT_DIRECTORIES`) are not passed on.
- **A link to a file outside the project was dropped without a word.** It is now listed under
  "Skipped" like a path from a foreign index.
- **Commands after reserved words** (`if npx openapi-typescript …; then`, `do`, `!`, `{`) were
  read as arguments of the reserved word. The word reader now follows the shell grammar: a
  reserved word counts only unquoted and in command position, its command starts after it, and
  `for`, `select`, `case` and `[[` clauses hold no command; `function NAME` is a header.
- **Large YAML files were slow** (21 s on a crafted file). Three causes: every YAML file was
  parsed, `yaml` checks duplicate keys in quadratic time, and line numbers were counted from the
  start of the text for every finding. Now a YAML file that names no old package is not parsed
  (it can hold nothing to change or report), the parser runs with `uniqueKeys: false` and a
  linear check over the keys reports the same duplicate with the same offset, and lines are found
  by a binary search over the line starts. Tests bound the time.
- **Commands that were neither migrated nor reported.** A Dockerfile `RUN`, `CMD` or
  `ENTRYPOINT` in exec form (a JSON array of strings, as Docker reads it; anything else is shell
  form) is one command, each string a word. In a Makefile the value of an assignment is read as a
  command, `$(…)` and `${…}` are one word, and the flags after a reference to a variable that
  holds the generator (`$(OAT) a.yaml -it`) are renamed. Template literals with substitutions in
  sources are reported as written. The values of a workflow `env:` map are read as shell text.
- **Catalog entries and their dependencies drifted apart.** Each file was migrated alone, so a
  dependency kept under its old name (its new name was in the same field) pointed at a catalog
  entry that was renamed, and a dependency on an entry the tool does not edit (an alias, a flow
  map) was renamed: both made the install fail. Decision: before any file is migrated, the
  manifests and catalog files that name an old package are read into a catalog plan. An entry
  that a kept dependency still uses stays, and a dependency on an entry that stays (in a catalog
  without the new name) stays; both are reported. Inserting a new entry for the new name was
  rejected: it would change a file the user did not expect to grow, and it hides which of the two
  names the project means.

## Amendment (2026-11-09): reading and writing files

The rc.4 review found three ways the tool changed a project by halves or without a word:

- A file was read as UTF-8 with replacement: in a Latin-1 file `é` became `�` when the file was
  written for another change. Files are now decoded with a fatal decoder. A file that is not
  UTF-8 is not migrated, and the report lists it under "Skipped" with the reason. Guessing the
  encoding was rejected: a wrong guess changes bytes the same way, and the tool has no way to
  check it.
- A file that could not be read (`EACCES`) stopped the run in the middle of the writes, and the
  files already written were not named. The tool now reads and migrates every file first; a file
  that cannot be read is skipped and reported, with its error code. Then it writes. A failed
  write stops the writing (a full disk or a read-only folder fails the next write too); the
  report names the file, the files written before it and the ones that were not, and the command
  exits with `1`. A rollback was rejected: undoing a rename can fail for the same reason, and the
  user has git for that. The `ProjectFiles` port gives these outcomes as values (`FileRead`,
  `FileWrite`), so the application layer never sees a file system error.
- `--log` naming a folder failed with a stack trace, and `--root` naming a file with `spawn
ENOTDIR`. The log file is now opened when the logger is created, and the root is checked
  before the listing, each with a message that names the path.

## Amendment (2026-11-09): package names in structured files

The rc.4 review found the package renames of package.json and the catalogs incomplete or lossy:

- **package.json was printed again** with `JSON.stringify`: inline arrays were spread over lines,
  `1.0` became `1`, large numbers lost digits, integer keys moved to the front, `\/` lost its
  backslash, the first of two duplicate keys was dropped (M9), and a byte order mark made the file
  unreadable (M19).
- **Catalog ranges with spaces** (`>=0.13 <0.18`, `^0.13 || ^0.17`, quoted or not) were cut at
  the first space, so the entry kept its old name or got half a range (M1, M18).
- **Fields that name a package** were left: `peerDependenciesMeta` (an optional peer became
  required), `dependenciesMeta`, `bundleDependencies` (M3); so were bun's catalogs in package.json
  and Yarn's in `.yarnrc.yml` (M7), `package.yaml`, the import maps of `deno.json`, and `npm:`
  aliases and specifiers (M13). Renaming a key that sat next to its new name gave the map the
  same key twice (M10).

Decision: package.json, `package.yaml`, `pnpm-workspace.yaml`, `.yarnrc.yml`, `deno.json`,
`deno.jsonc` and `import_map.json` are read by the same two readers as the command files
(amendment of 2026-11-08), which now give one canonical shape: a tree per document with the
offsets of every node (`domain/config-documents.ts`). A scalar carries its whole span (quotes
included), the span of its text as written, and how to write a new value there; the string
values with their key paths, which the command migrations read, are derived from the tree, so
there is one reader per format and no second API. The package-name migrations decide what to
rename and replace only those keys and values, so everything else stays byte for byte. A new
YAML value keeps the quoting of the old one when it reads back as the same string, and is quoted
otherwise. A block scalar, an alias, and an anchored or tagged value are not replaced: a new
value there could change other places or the type; an entry with such a value that names an
original package is reported. The same rules cover every format: a renamed entry gets the
version of the tool in the style of its old range; a key whose new name is already in the same
map is left and reported; an `npm:` alias of an original package is retargeted. Scripts of
package.json and `package.yaml` stay with the command migrations. A hand-written JSON or YAML
scanner was rejected: it drifted from the grammar at its edges (flow collections, escapes,
ranges with spaces), which is where these findings came from. A config that does not parse and
names an original package is reported with the line and column where it stops being valid.
pnpm's `package.json5` is not read: JSON5 strings (single quotes, line continuations) need a
third reader that would serve one rare file. Such a manifest that names an original package is
reported, and the declared-package rule counts it as declaring every package, like a manifest
that cannot be parsed.

## Amendment (2026-11-09): the recheck of the second review

A recheck of the fixes above found three regressions and four gaps.

- **A template with a string in its substitution stopped the run.** Templates with substitutions
  are found as written, so `` `${on ? "on" : "off"}` `` gave a string that held two others, and
  the specifier migration took that for a scanner bug: six of seven real projects exited with
  "Source strings overlap". Strings now nest: the migration walks them outer before inner and
  fails only on spans that cross. A string inside a template that was replaced is part of the
  replacement, so it is reported, not edited a second time.
- **A link that loops or goes through a file stopped the run.** The listing resolves links since
  the second review and handled only `ENOENT`; `ELOOP` and `ENOTDIR` now mean "leads to no file"
  too, and such a path is left out like a dangling link. A link to the project folder itself is
  in the project, not outside it.
- **An empty `.git` folder made the forced work tree wrong.** Git passes over a `.git` that is no
  repository and finds the one above; the tool took the nearest `.git` entry, so the listing and
  the ignore rules belonged to different folders. Each folder with a `.git` entry is now checked
  with `git rev-parse --git-dir` under `GIT_CEILING_DIRECTORIES` set to its parent, so git itself
  decides, and the first one git accepts is the work tree. Reading git's repository format in the
  tool was rejected: it would drift from git's own rules.
- **npx put a planted git on PATH.** npx adds the project's `node_modules/.bin` to `PATH` as an
  absolute folder, so the lookup of the first review still ran a `git` from the project. A `PATH`
  folder is now skipped when its real path is the project folder or lies under it; the project
  root is given to the git adapter by the composition root, one listing per run.
- **npx also put the `node_modules/.bin` of every folder above the project on PATH** (the third
  recheck). Migrating one package of a workspace (`--root packages/api`, or from that folder)
  still ran a `git` planted in the workspace root's `node_modules/.bin`. A `PATH` folder whose real
  path has a `node_modules` segment is now skipped too: package managers put the bins of packages
  there, never a system git. Skipping the folders under the git work tree was rejected: the work
  tree is found with git, so it is not known before git is chosen.
- **Overrides that point at a catalog entry** (`overrides: { openapi-fetch: "catalog:" }`) are
  reported and left as they are, so the entry was renamed under them and the install failed. The
  catalog plan now counts them as users of the entry, like a kept dependency.
- **Commands in exec form after `RUN` flags, in `["sh", "-c", "…"]`, behind a chain of Makefile
  variables, in target variables and behind `$GEN` from a workflow `env`** were neither migrated
  nor reported. The exec form is found after `RUN --mount=…`; the command line of a shell's `-c`
  is read as shell text (with JSON escapes, whose offsets do not map onto the file, it is
  reported); a variable set to a generator variable holds the generator; `env` values are read as
  the variables of the file. A variable of old flags that the generator gets is reported, not
  changed, because the same variable may serve other commands. The `FileVariables` interface of
  the command migration carries both questions, so Makefiles and YAML files answer them the same
  way.
- **The generator behind `ARG` and `ENV` of a Dockerfile, a one-letter Makefile `$G` and a
  workflow `${{ env.GEN }}`** was neither migrated nor reported (the third recheck). Dockerfiles
  now answer `FileVariables` too, from their `ARG` and `ENV` values (also of the legacy form
  `ENV NAME value`); a Makefile reads `$G` as the variable `G`, as make does; a workflow reads
  `${{ env.GEN }}` as `$GEN`, because the runner puts the same value there. One builder,
  `shellVariables`, turns the definitions of each file kind into the answers, so the rule that a
  word without a variable matches no definition holds for all of them.

## Amendment (2026-11-09): the recheck after the rc.4 fixes

- **A planted git still ran from a `node_modules` that was spelled in another case or was a link.**
  The real path of a `PATH` folder keeps the case the folder was created with, and macOS and
  Windows ignore case, so `NODE_MODULES/.bin` is the folder npx put on `PATH`; and a
  `node_modules` that links to a folder with another name has no `node_modules` in its real path.
  The folder is now checked as written and as its real path, and `node_modules` matches in any
  case on every platform: on a file system that keeps case apart this only passes over more
  folders, none of which holds a system git.
- **The flags after a variable changed for another program.** Definitions of one name were read as
  one, and one definition that ran the generator was enough: `ENV GEN=mytool` in another stage, a
  step `env`, or a later Makefile line (make expands a recipe after it has read the whole file)
  still got `-it` renamed. The tool does not follow which definition reaches which command, so
  `variablePrograms` now says `generator` only when every definition of the name runs the
  generator, follows references (`ENV GEN=$GEN`, `GEN := $(OAT)`), counts `+=` as keeping the
  program, and reads a reference to a variable the file never sets as another program. When the
  definitions disagree, the flags are reported as the manual step `variable-not-only-generator`.
  Tracking scopes per file kind (stages, jobs and steps, make's expansion order) was rejected: it
  is three models for one question, and each misses cases (a base image's `ENV`, `override`,
  target variables) that the conservative rule reports.

## Amendment (2026-11-09): the third review of the migration tool

The rc.5 review found places that named the old packages and were neither migrated nor reported.

- **A `catalog:` dependency whose entry is outside the project** (`--root packages/api` of a pnpm
  workspace) was renamed, and the install failed: the entry above the root is not edited. The
  catalog plan now knows which entries the project defines; a dependency on any other keeps its
  name and is reported as `catalog-entry-outside`.
- **Command wrappers** the tool did not know (`yarn workspace <name>`, `dotenvx run`, `doppler run`,
  `nx exec`, bare `bun`, `corepack`, `tsx`, `ts-node`, `exec -a`, `command`, `nice`, `timeout`,
  `xargs`, `yarn global add`) hid the generator. They are launchers now, each with the operands
  it takes. `yarn run` and `bun run` are not: like `npm run` they name scripts, and a script name
  that happens to be an old package name is not the package. Every word of a command that names
  an old package and that no rule renamed or reported is now reported as `old-name-in-command`,
  so a wrapper the tool does not know is never silence.
- **Here-documents** were read as commands. Their bodies are data now, except the body of a shell
  (`sh`, `bash`, `RUN <<EOF`), which is read as commands. `<<-` strips tabs, a YAML block keeps
  its indentation, and `<<<` is a here-string, not a here-document.
- **A rewritten `transform` broke its options type**: options declared as `OpenAPITSOptions` do not
  take type text. The annotations of rewritten options are retargeted to `OpenAPITSIrOptions`,
  through any import of the name; a type that only builds on `OpenAPITSOptions`
  (`Partial<OpenAPITSOptions>`) keeps the `transform` and reports `typed-options`.
- **Node subpath imports** (`"imports": { "#client": "openapi-fetch" }`) kept the old targets. A
  target that names an old package, under any nesting of conditions and fallbacks, is renamed;
  a deep target is reported. The `#` keys are the project's own and stay.
- **A Deno import map named by its config** (`"importMap": "./deps.json"`) was not read. The
  configs are read before the plan, and the files they name in the project are import maps
  whatever their name; their imports declare packages for the files of the config, not of the
  map's folder. A map named by a URL or a path outside the project is reported.
- **More files run the generator**: Task's `Taskfile.yml` (`cmds`, `cmd`, `sh`, `status`),
  pre-commit's `entry` with its `args` read as one command (pre-commit runs no shell) and its
  `additional_dependencies`, `simple-git-hooks`, `lint-staged` and `nx.targets` in the manifest,
  `.lintstagedrc*`, `.simple-git-hooks.json` and the `targetDefaults` of `nx.json`. Each file kind
  names its own command keys or key paths (`domain/command-paths.ts`,
  `domain/yaml-command-keys.ts`); adding the keys to every YAML file was rejected, since `cmd` and
  `entry` mean other things elsewhere.
- **Patch files of an old package** (patch-package, pnpm, Yarn) stopped applying. They are found by
  the file names their tools give them and reported: the new package has other code.
- **Package manager settings** other than overrides (`packageExtensions`,
  `allowedDeprecatedVersions`, `onlyBuiltDependencies`, …, in `pnpm-workspace.yaml`, the `pnpm`
  field and `.yarnrc.yml`) were not read. Every section is read by its keys and its values, and
  one that names an old package is reported as `setting-names-package`; overrides keep their own
  step, and a section of the `pnpm` field is named by its own key (`pnpm.overrides`).
- **Smaller gaps**: the ESM blocks of `.mdx` pages are read as scripts; a bundler query
  (`openapi-fetch?url`) ends the package name and is kept; an import from the `node_modules`
  folder of an old package is reported; and the Jest patterns that name an old package
  (`moduleNameMapper`, `transformIgnorePatterns`, in `jest.config.*` and the `jest` field) are
  reported, not changed, because a pattern is not a module specifier.

## Amendment (2026-11-10): the fourth review of the migration tool

The rc.5 hunt found changes that broke a project and places that were skipped without a word.

- **A dependency on a local package keeps its name.** A `workspace:`, `link:`, `file:` or
  `portal:` spec points at a package of the project, not at npm: a fork named `openapi-fetch` in
  the workspace. The new name pointed at a package the workspace does not have. Such a dependency
  and the imports of it in the files of that manifest are kept and reported as `local-package`.
  Renaming the local package too was rejected: it is the user's code, and only they know whether
  it is a copy of the original.
- **A successor alias in place is accepted.** The fix that the report gives for `swr-openapi`
  (`overrides: { "openapi-fetch": "npm:openapi-typesafe-fetch@…" }`) was itself reported on the
  next run, so the report never got clean. An override or resolution that points an old name at
  its successor (`domain/successor-aliases.ts`) is no longer a step, and a peer that it covers
  needs no alias advice.
- **An API description is data.** A YAML document with a top-level `openapi`, `swagger` or
  `asyncapi` key had its example `command` values rewritten, and the change reached the
  generated JSDoc. Such a file is not migrated. Limiting the command keys to the positions that
  each CI format uses was considered and not done: it needs a schema per format, and the one
  file kind that holds such keys as data is now left out.
- **Shell variables that a shell text sets itself.** `GEN="npx openapi-typescript"` then
  `$GEN a.yaml -it` in a script, a `run` block or a package.json script was skipped: assignments
  were passed over, and only Makefiles, Dockerfiles and YAML `env` had variables. The assignments
  of a shell text (alone, before a command, and the arguments of `export`, `readonly`, `local`,
  `declare`, `typeset`) are now read as variables (`domain/shell-assignments.ts`), and combined
  with those of the file by the same rule as before: the flags after a variable change only when
  every definition runs the generator. A plain or single-string value is read as a command line
  where it is set, so it is renamed there; a value built of several parts or of expansions is not.
  The tool does not follow which assignment reaches which command, for the reason given above.
- **Justfiles have variables.** just interpolates `{{gen}}` before the shell runs a recipe line,
  so a justfile is read like a Makefile (`domain/justfile-migration.ts`): a string value is a
  command line, a bare name is a reference, any other expression (`env(…)`, a backtick) is
  another program.
- **A step script for another program** (`shell: python`, a CircleCI `shell` next to `command`) is
  code of that language. It is no longer read as commands, and it is reported as
  `script-not-shell` when it names an old package. Parsing other languages was rejected.
- **An exported name stays.** `export { BLOB }` named a constant through an alias symbol, which
  the use count missed, so the constant was removed and the file broke; an exported `transform`
  function was rewritten while other modules used its old return type. An export counts as a use,
  and an exported function is kept and reported as `shared-function`.
- **Smaller gaps**: the wireit `command` of a manifest is a command path; a `typesVersions` path
  into the installed files of an old package is reported, as a tsconfig path is; and a closed
  output pipe (`migrate | head`) ends the run quietly, as in the generator's CLI.

## Amendment (2026-11-11): the fifth review of the migration tool

The rc.6 hunt found output that did not compile and commands that kept the old generator.

- **`irCallbacks: true` keeps its literal type.** The option was added as `true` to options that
  a later `const` held without a type, so TypeScript widened it to `boolean` and the call no
  longer matched the overload with IR callbacks. In options that nothing types where they are
  written it is now `true as const` (JS: `/** @type {const} */ (true)`). The generator also got a
  last overload with required `GeneratorOptions`, so `Parameters<typeof openapiTS>[1]` types the
  callbacks of a wrapper. This fixes output that did not compile, so it is on by default (ADR-021).
- **An import that JSDoc names stays.** The use count walked the syntax children only, so an
  import that only a JSDoc type named was removed. JSDoc nodes are children too now.
- **The nearest manifest decides a local package.** A root manifest that lists `openapi-fetch`
  from npm and a nested one that lists it with `workspace:` gave the nested files the new name.
  The manifest nearest to a file that lists a name decides, as Node's resolution does.
- **Split API descriptions and overlays are data.** Only a YAML file with the top-level key was
  left out, so the `$ref` parts of a split description and Overlay or Arazzo files were rewritten.
  The `$ref` files that an API description reaches (YAML or JSON, relative paths inside the
  project) are left out too, and `overlay` and `arazzo` count as API description keys.
- **The shell of a CI step is the one it runs with.** `defaults.run.shell` of a job or workflow,
  `env` before a program, a `.exe` suffix, `msys2` and `wsl-bash` were not read, so a step that
  ran Python was read as shell or the reverse. The nearest `shell` wins, and an own `shell` beats
  a default of the same map.
- **Justfile expressions are command lines in their strings.** Every string and backtick of a
  value, a recipe parameter default and an interpolation is read as a command line where it is
  written. A computed value or a parameter may run another program, so the flags after it are
  reported, not changed.
- **Shell default values are command lines.** `${GEN:-npx openapi-typescript}`, `${GEN:=…}` and
  `${GEN:+…}` were split at their blanks and never read. A `${…}` expansion is one part of a word,
  and its word is read as a command line where it is written, so the old name is renamed. The
  variable may hold another program from outside the text, so the flags after it are reported;
  `${NAME:=word}` also counts as a definition of `NAME`.
- **A variable that the tool cannot read is reported.** A program variable with no definition the
  tool reads (another GitLab `script` item, `$GITHUB_ENV`, a Makefile recipe's `$$GEN`, a bash
  array, the environment, a Make variable that no line sets) had its old flags kept without a
  word. Such a variable may run the generator, so its old flags are reported; a variable known to
  run another program stays silent. Following values across `script` items, steps and recipe
  lines was rejected for now: each needs its own model of which shell runs what, and a report is
  correct for all of them. Only the files that name an old package are read, so the report does
  not reach projects without one. A bash array assignment is one word, and its items are read as
  a command line, so the old name in it is renamed.

## Amendment (2026-11-12): the sixth review of the migration tool

The rc.7 hunt found a crash, output that did not compile, and files that were read as the wrong
language.

- **A tool bug skips one file.** A Dockerfile `ARG` default was read twice, so two edits overlapped
  and the run crashed with nothing written. `ARG` and `ENV` values are read once now. Overlapping
  edits or source strings are a bug of the tool (`MigrationBugError`), never of the project: the
  file is skipped and listed under "Skipped (not migrated, not written)", every other file is
  migrated, and the run exits with 1, so CI does not pass on a partial migration. Stopping the
  whole run was rejected: one unread file should not block the rest, and the exit code still
  says that something needs a bug report.
- **GitHub Actions expressions are read.** The string literals of `${{ … }}` and the `default` of
  a workflow or action input are read as command lines where they are written, and a word that is
  a whole expression may run the generator or another program, so its old flags are reported.
- **A computed Make program is reported as written.** `$(or $(GEN),openapi-typescript)` may run
  another program, so its flags are reported with the text of the call.
- **A declared transform type is rewritten or kept.** The type of the `const` that holds a
  `transform`, a JSDoc `@type` or `@returns` that named a TypeScript node type stayed, so the
  rewritten file did not compile. A node type in such a declaration (`ts.TypeNode`,
  `import("typescript").TypeNode`, a named import) becomes `string`, through unions,
  intersections, parentheses and type literals. Any other type (a local alias, an array) keeps
  the `transform` with the reason `declared-type`: guessing the meaning of a user's alias could
  produce code that compiles but means something else.
- **An API description needs a version.** A GitLab job named `openapi` made `.gitlab-ci.yml` an
  API description, so its commands were left. A top-level API key counts only with a version as
  its value (`openapi: 3.1.0`, also with a pre-release), and a CI config (by name or folder) is
  never an API description or a `$ref` part of one.
- **Scripts of other languages are not shell.** A CircleCI job takes the `shell` of the executor
  it names, below its own `shell`. A justfile recipe whose shebang names a program other than a
  shell, and the code of `python -c`, `node`/`bun -e`/`-p`, `ruby -e` and `perl -e/-E`, are left
  as they are and reported when they name an old package, like a CI step with `shell: python`.
  The interpreter is found at any word of a command, since launchers run one. The message says
  "the script runs with …" for all of them.
- **Smaller gaps.** A justfile parameter default is a value of its variable, so its old flags
  are reported where it is passed (`{{flags}}`). A path that names the `node_modules` folder of an
  old package is reported like a path to a file in it. A launcher or installer written with a
  Windows suffix (`npx.cmd`, `pnpm.exe`, `npm.ps1`) is read as itself.
- **The objects that options spread are read.** `openapiTS(s, { ...base })` without an own
  `transform` was not reported, though `base` could hold callbacks. A spread object that the file
  writes (inline, or a `const` with an object literal, also through other spreads) is read like the
  options: its legacy callbacks are reported, and a `transform` in it is kept with the reason
  `in-spread`, since rewriting it would change an object other code may reach and need
  `irCallbacks` on the options that spread it. Any other spread is reported as
  `options-spread-not-inspected`.

## Amendment (2026-11-12): the seventh review of the migration tool

The rc.8 hunt found flags changed or kept without a word, a file skipped by a tool bug, and
commands the tool did not read.

- **A program the run decides is a definition of its own.** A variable definition can now be
  `run-time` (`domain/variable-programs.ts`): it can run the generator and another program, so
  the flags after the variable are kept and reported. A workflow `env` value whose program is an
  expression (`GEN: ${{ vars.GEN || 'npx openapi-typescript' }}`, `GEN: ${{ vars.GEN }}`), a
  Makefile `?=` (the environment or the command line can set the variable) and a Makefile value
  whose program make computes (`$(or …)`, `$(shell …)`) are such definitions. Reading the
  literal of an expression as the variable's whole value made `$GEN` the generator, and an
  expression without a literal made it another program; both were silent. The program of a
  Makefile value is the program word of its first command, so `GEN := $(OAT) --redoc r.yaml`
  runs what `OAT` runs.
- **A literal is read once.** In `${GEN:-${{ inputs.gen || '…' }}}` the literal was read inside
  the word of the expansion and again as a literal of the whole word, so two edits overlapped and
  the file was skipped. A literal inside an expansion is read only with the expansion's word, and an
  expression inside an expansion is skipped whole when its end is found, since its `}}` is the
  runner's. A report whose only findings were in a file a tool bug skipped no longer says
  "Nothing to migrate".
- **Values that reach a command by another name.** An input default is the value of
  `${{ inputs.NAME }}` (`domain/input-defaults.ts`), and an exported justfile variable (`export`,
  a `$name` parameter, `set export`) is a shell variable of the recipe lines, so old flags in them
  are reported where a command gets them, as for `$FLAGS` of an `env` value.
- **The suffix rule covers the generator bin.** `openapi-typescript.cmd`, `.ps1`, `.exe` and
  `node_modules\.bin\openapi-typescript.cmd` are renamed. A program word with such a suffix runs
  in cmd.exe or PowerShell, where `\` separates folders, so its path is read from the word as
  written (`domain/program-paths.ts`).
- **YAML aliases are followed.** The YAML reader keeps anchors and aliases, and the command
  migrations read each string where it is used: where it is written and again at the path of each
  alias, with the same offsets (`usedDocumentStrings`), each place of the text once. An alias uses
  the last anchor of its name before it that does not hold it, as YAML reads it. The other
  migrations (manifests, catalogs, Dependabot) still read each string once at its own path: an
  alias there is a value the tool does not edit, which is reported as before.
- **Make functions have command text.** The arguments that `$(if …)` (its second and third),
  `$(or …)` and `$(and …)` can give as their value are read as command lines where they are
  written (`domain/make-expansions.ts`), also in nested calls, as the literals of a workflow
  expression are. Other functions compute a new text, so their arguments stay unread (since the
  eighth review, a call that names an old package is reported).
- **A one-member union is its member.** The type text of a union or intersection of one member
  dropped the member's operator, so `createArrayTypeNode(createUnionTypeNode([DATE_OR_NULL]))`
  gave `Date | null[]`. Precedence now follows the node kinds, as the TypeScript printer does.
  This fixes silently wrong output, so it is on by default (ADR-021).

## Amendment (2026-11-13): the eighth review of the migration tool

The rc.9 hunt found old flags and old names kept without a word, where the tool read only some
forms of a value. The rule for all of them: after `--write`, no command may still run the old
generator or pass it an old flag silently; a form the tool cannot migrate is a manual step, and
the report never says "Nothing to migrate" for it.

- **Appended text is part of a variable's value.** A Makefile `GEN += -it`, a bash `G+=" -it"`
  and a justfile `"npx openapi-typescript" + " -it"` were read as commands of their own, so the
  old flag in them stayed. Appended words are now the arguments after the program the value runs
  (`AppendedValue`, `domain/argument-findings.ts`): renamed where they are written when every
  definition runs the generator, reported when one may run another program, as the flags after
  `$(GEN)` are. Where the appended text is depends on the earlier definitions of the name
  (`appendedPlace`): after a value the file sets (it keeps that program), at the start of the
  value when every earlier one is empty (`CMD =`, then `CMD += npx openapi-typescript`: its own
  program counts), or after a value from outside the file (the environment, an included file),
  which may be the generator. An empty value sets no program of its own (`no-program`, which
  replaces `append`). A justfile value of strings and names joined by `+` holds the program in its
  first part only when every later part is a string joined at a blank; a variable part or a join
  inside a word can change the program word, so such a value stays computed and the flags in its
  later strings are reported. Following which `+=` reaches which use was rejected for the reason
  given for definitions above.
- **Each YAML file kind names its variable maps.** Only `env` was read. GitLab CI `variables`
  (also a map with `value`), CircleCI, Drone and Woodpecker `environment`, Docker Compose
  `environment` (a map or `NAME=value` items) and Taskfile `vars` and `env` are read like a
  workflow `env` value (`domain/yaml-environments.ts`), each only in its own file kind, chosen by
  the file's name or folder (`application/yaml-file-kinds.ts`): the same keys mean other things in
  other files, the reason the command keys are per kind. Task's `{{.GEN}}` is read as `$GEN`, as
  `${{ env.GEN }}` is.
- **Azure Pipelines variables, with their macros.** Azure `variables` (a map, or a list of
  `- name: … / value: …` items; a `group` or `template` item sets nothing the tool can read) and
  a step's `env` are read the same way in `azure-pipelines.yml`, a named
  `*.azure-pipelines.yml` or `azure-pipelines-*.yml`, and the files of `.azure-pipelines/` or
  `.azuredevops/`. A script reads a pipeline variable as `$GEN` or `${GEN}`, by its name
  upper-cased with `_` for `.`, and Azure puts the value of the macro `$(gen)` and the
  expression `${{ variables.gen }}` into the script first, so both are read as `$GEN`. A macro of
  a name the file does not set stays as written: Azure leaves it, and the shell runs `$(date)` as
  a command. The reading found a fault in the GitLab one: a list item's `value` under `variables`
  counted as a GitLab value map for a variable named by the item's index. A value map now needs a
  variable name above it.
- **Kubernetes `env` items are reported, not migrated.** A container's
  `env: [{ name: GEN, value: npx openapi-typescript }]` goes to the program as it is, and
  Kubernetes puts it into `command` and `args` for `$(GEN)` without a shell. The tool does not
  read those rules, so an `env` item whose value names an old package is an `old-name-in-command`
  step in every YAML file kind that does not read it as a variable.
- **Every expression has a value for its flags.** Only a word that was exactly
  `${{ inputs.NAME }}` had the input default as its value. A word that is any expression now gets
  the defaults of the inputs it reads (`inputs.NAME`, `github.event.inputs.NAME`) and its string
  literals (`${{ inputs.flags || '-it' }}`), and the expressions in a variable's value
  (`FL: ${{ inputs.flags }}`, used as `$FL`) are read the same way.
- **A shell default may run the generator from outside.** In `${GEN:-word}` the variable's value
  came from outside the text and counted as another program, so `${GEN:-${{ inputs.gen }}} -it`
  and `${GEN:-mytool} -it` were silent. A variable that no definition the tool reads sets may run
  the generator, as an unread `$GEN` may, and a word that is a workflow expression is a value the
  run decides, so the flags after both are reported.
- **"Unread" means reported.** The seventh review left the arguments of other make functions
  unread, and a generator inside `$(strip …)` or `$(firstword …)` kept its old name without a
  word. `$(strip …)` gives its argument text, so it is read like `$(or …)`. A call of any other
  function whose arguments name an old package (`$(firstword …)`, `$(call …)`, `$(shell …)`)
  is now an `old-name-in-command` step; the tool still does not compute what it gives.
- **A Windows path without a suffix.** cmd.exe finds `node_modules\.bin\openapi-typescript.cmd`
  from `node_modules\.bin\openapi-typescript`, which a POSIX shell would read as escapes. A `\`
  between two path segments of a word without `/` makes it a Windows path, as a suffix does; a
  `\` at the start (`\openapi-typescript`, which skips an alias) still escapes.

## Review trigger

TypeScript 7 publishes a JavaScript API, or `@typescript/typescript6` stops being published.
