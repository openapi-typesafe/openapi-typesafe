---
"openapi-typesafe": patch
---

Entries of `.redocly.lint-ignore.yaml` apply again to remote `$ref` documents whose URL is written
in a form other than the URL parser's own, such as `http://LOCALHOST:8080/pet.yaml`,
`http://host/x/../pet.yaml` or `http://host/my pet.yaml`: such a document keeps the name
`redocly lint` gives it. A query in such a URL stays hidden in messages also after a space.
