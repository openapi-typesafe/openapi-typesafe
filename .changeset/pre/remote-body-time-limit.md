---
"openapi-typesafe": patch
---

The 60-second limit on a remote document or `$ref` now covers the body too. A server that sent
the body slowly kept the run waiting, and a root URL then failed with "Cannot set property message
of ... which has only a getter" instead of "Timed out after 60000 ms loading <url>".
