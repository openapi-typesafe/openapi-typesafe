---
"openapi-typesafe-migrate": patch
---

In a shell script that appends to a variable twice (`H+="npx openapi-typescript"`, then
`H+=" -it"`), the appended old flag is now reported. Before, the name was renamed and `-it` was
kept without a word, so `$H api.yaml` failed.
