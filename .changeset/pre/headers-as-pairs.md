---
"openapi-typesafe-fetch": patch
---

Request fixes:

- Headers given as a list of pairs (`[["x-t", "1"]]`) work.
- A form body with `; charset=UTF-8` in its `Content-Type` is sent as a form, and its `null` fields
  are left out instead of being sent as `"null"`.
- A query parameter that serializes to nothing (an empty array or object, `null`) no longer leaves
  a stray `&` (`a=1&&b=2`), and exploded arrays and objects leave out their `null` and `undefined`
  items.
- Path values with `$'`, `` $` ``, `$&` or `$$` are sent as written.
- The invalid-middleware error has its missing backtick back.
