---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

A `json` inside the parameters of a media type no longer makes it a JSON media type in the types,
as at runtime: an error declared as `text/plain; profile=urn:a+json` or
`message/http; msgtype=application/json` is typed as the text (`string`) the client returns, and
`JSONLike` and `RequestBodyJSON` leave such media types out. Only the media type before the `;`
counts, for media ranges (`text/*`) too.
