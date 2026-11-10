---
"openapi-typesafe-migrate": patch
---

The body of a here-document (`<<NOTE`, `<<'NOTE'`, `<<-NOTE`) is read as data in scripts, `run: |`
blocks and Dockerfiles: an apostrophe in it (`Don't edit`) opened a quote to the end of the file,
and no command after it was migrated. A here-document that a shell runs (`bash <<EOF`,
Dockerfile `RUN <<EOF`) is read as the script it is, so its commands are migrated.
