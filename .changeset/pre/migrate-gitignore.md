---
"openapi-typesafe-migrate": patch
---

In a git repository the tool now reads the files git lists (tracked files, and untracked files
that `.gitignore` does not ignore), so ignored build output such as `cjs/`, `esm/` or `types/` is
no longer rewritten. Outside a git repository, or without `git`, it walks the tree as before. The
log says which way the files were listed.
