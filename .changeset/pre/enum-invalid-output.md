---
"openapi-typesafe": patch
---

Fix `--enum` output that did not compile: an empty string value now gives the member `"" = ""`, a member name that must be quoted is escaped (`"\\"` instead of `"\"`), and a line break in `x-enum-descriptions` no longer ends the `//` comment early (it becomes a space). The deprecated `tsEnum` / `tsEnumMember` helpers get the same fixes. Fixes upstream #2807, #2812, #2614, #2838.
