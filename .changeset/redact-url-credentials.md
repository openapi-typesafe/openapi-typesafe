---
"openapi-typesafe": patch
---

Error messages, error details and log lines no longer show the user info of a URL. A source or
`$ref` URL such as `https://user:token@host/spec.yaml` fails (fetch refuses credentials in URLs),
and the message printed the token, so it ended up in CI job logs. Such URLs are now shown as
`https://***@host/spec.yaml`.
