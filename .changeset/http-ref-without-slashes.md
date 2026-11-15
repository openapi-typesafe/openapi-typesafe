---
"openapi-typesafe": patch
---

A `$ref` written as an `http:` or `https:` URL without `//` (`http:127.0.0.1:8080/pet.yaml`) is now fetched as that URL, as the same text is as the schema argument, and is checked against `--remote-ref-hosts`. It used to be read as a local file below the document's folder.
