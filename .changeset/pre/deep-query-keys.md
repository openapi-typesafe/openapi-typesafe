---
"openapi-typesafe-react-query": patch
---

A query key of a body or a parameter value nested thousands of objects deep no longer depends on
the JavaScript stack. Such a key was cut at a depth that changed from call to call, so the same
body could get a new key and a new request, and two bodies that differed deep down shared one
cache entry. The part of a value more than 100 objects deep is now listed under `"(deeper)"` in
the key.
