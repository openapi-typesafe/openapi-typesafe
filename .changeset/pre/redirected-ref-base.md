---
"openapi-typesafe": patch
---

Relative `$ref`s of a remote document that redirects resolve from the URL it was redirected to.
A spec URL `https://host/latest` that redirects to `/static/v1/root.yaml` loaded `./pet.yaml` from
`https://host/pet.yaml`, which gave the types of another file or failed with a 404.
