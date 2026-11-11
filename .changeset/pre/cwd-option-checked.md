---
"openapi-typesafe": patch
---

The Node API's `cwd` option is read like `localRefRoot`: a string such as `"file:///app/specs/"` is
a URL, where it was read as a relative path. A `cwd` of another type (a number), a URL of another
scheme, or a relative `localRefRoot` with an `http:` `cwd` rejects with `OPTION_INVALID` instead of
resolving a wrong directory or throwing a plain `TypeError`.
