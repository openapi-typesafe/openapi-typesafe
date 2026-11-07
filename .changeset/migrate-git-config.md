---
"openapi-typesafe-migrate": patch
---

The tool no longer runs a command from the git config of a nested repository. Git ran the
`core.fsmonitor` command of a planted `.git/config` (in a folder unpacked from an archive, or a bare
repository committed in a cloned one) during a dry run too. Every git command now runs with
`core.fsmonitor` turned off and `safe.bareRepository=explicit`; a bare repository found that way is
walked as a plain folder.
