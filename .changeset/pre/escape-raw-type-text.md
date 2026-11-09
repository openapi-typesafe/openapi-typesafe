---
"openapi-typesafe": patch
---

Security: names and URLs from the document are escaped where they reach code; a remote document can
no longer `$ref` local files; one schema loads at most 10,000 remote documents; configured headers are
not sent on through redirects to another origin; and the user info and the query of a URL are
hidden in messages and in the `cause` of an error. A location that is not a valid URL fails with
`CLI_LOCATION_INVALID` in the CLI and `SCHEMA_SOURCE_INVALID` in the Node API, and a `$ref` whose
scheme is written in uppercase (`HTTP://`) loads as a URL.
