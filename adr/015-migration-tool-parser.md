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
  A YAML parser was not added: the file is edited line by line so that comments and formatting
  stay, and the tool has no YAML dependency.

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
  `pnpm-workspace.yaml` are still edited line by line as the amendment above says; with `yaml`
  now a dependency, that reason no longer holds, and moving them onto the reader is open.
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

## Review trigger

TypeScript 7 publishes a JavaScript API, or `@typescript/typescript6` stops being published.
