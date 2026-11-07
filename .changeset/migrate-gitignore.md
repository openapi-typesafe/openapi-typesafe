---
"openapi-typesafe-migrate": patch
---

In a git repository the tool now reads the files git lists (tracked files, and untracked files
that `.gitignore` does not ignore), so ignored build output such as `cjs/`, `esm/` or `types/` is
no longer rewritten. Submodules and nested repositories are read the same way, each with its own
`.gitignore`. Outside a git repository, without `git` 2.31 or later, or in a folder that the
repository around it ignores, it walks the tree as before. The log says how each folder was read.
