---
"openapi-typesafe": patch
---

An empty `--output` or `--redocly` (`-o "$OUT"` with `OUT` unset, `--output=`, a trailing `-o`)
now fails with `CLI_FLAG_INVALID` and exit code `2`. It used to write the types to stdout, or look
for another `redocly.yaml`, without a word.
