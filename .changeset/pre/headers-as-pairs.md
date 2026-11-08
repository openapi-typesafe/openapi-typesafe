---
"openapi-typesafe-fetch": patch
---

Request fixes:

- Headers given as a list of pairs (`[["x-t", "1"]]`) work.
- A form body with `; charset=UTF-8` in its `Content-Type` is sent as a form, and its `null` fields
  are left out instead of being sent as `"null"`.
- Path values with `$'`, `` $` ``, `$&` or `$$` are sent as written.
- The invalid-middleware error has its missing backtick back.
