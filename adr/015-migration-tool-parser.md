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

| Option | Pros | Cons |
|---|---|---|
| `@typescript/typescript6` (chosen) | Full TypeScript and JSX syntax; same AST the legacy callbacks use | 23 MB install for a one-time `npx` run |
| Regular expressions | No dependency | Cannot find returns or scopes; would corrupt code it does not understand |
| `typescript` 7 | Current compiler | No JavaScript API |
| A smaller parser (Babel, oxc, swc) | Smaller or faster | Another AST to learn, and TypeScript syntax lags behind TypeScript itself |
| No automatic rewrite (manual guide only) | No dependency | Scope-cut (2) of the plan; every legacy user does it by hand |

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

## Review trigger

TypeScript 7 publishes a JavaScript API, or `@typescript/typescript6` stops being published.
