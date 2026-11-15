---
"openapi-typesafe-migrate": patch
---

The script of `sh -c` is read as the shell reads it however it is quoted
(`sh -c 'npx openapi-typescript '"'"'a.yaml'"'"' -it'`, `sh -c "X='…'; \$X b.yaml -it"`), so
the generator and its old flags are renamed. A flag in quotes (`"-it"`) is renamed too. A flag
that quotes split (`-i't'`) is reported with its new name instead of kept silently.
