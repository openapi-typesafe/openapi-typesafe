---
"openapi-typesafe-fetch": patch
---

A form or multipart `Content-Type` with spaces or tabs before its parameters
(`application/x-www-form-urlencoded ; charset=utf-8`, RFC 9110 OWS) gives form data or `FormData`
again, in the runtime and in the result type of `defaultBodySerializer`; the object was sent as
JSON. The JSON check already took them.
