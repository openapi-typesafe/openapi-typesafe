---
"openapi-typesafe-react-query": patch
---

Keep one query key for a `FormData` or `File` body built while the component renders (the file's date in the key made a new request on every render), name a raw body's kind in `bodyType` so it never shares a key with a JSON body of the same shape, and leave out init fields set to `undefined`, so `{ headers: undefined }` has the same key as no init.
