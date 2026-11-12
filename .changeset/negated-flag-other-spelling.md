---
"openapi-typesafe": patch
---

A `--no-` flag in another letter case or spelling, such as `--no-Output`, `--no-OUTPUT`,
`--no-Local_Ref_Root` or `--no-O`, is now an unknown flag: it gets a notice and changes nothing, as
`--no-Enum` does, instead of failing with `CLI_FLAG_INVALID`. A removed flag in another spelling
(`--Immutable-Types`) is unknown too; `--immutable-types`, `--immutableTypes` and
`--no-immutable-types` still fail with `CLI_FLAG_REMOVED`, and `--no-output` and `--no-localRefRoot`
still fail with `CLI_FLAG_INVALID`.
