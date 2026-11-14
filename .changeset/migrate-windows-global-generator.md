---
"openapi-typesafe-migrate": patch
---

A command that runs the old generator from a Windows folder outside the project
(`C:\tools\openapi-typescript a.yaml`) is reported, as a POSIX path such as
`/usr/local/bin/openapi-typescript` already was.
