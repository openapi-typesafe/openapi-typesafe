---
"openapi-typesafe-react-query": patch
---

A header pair in a query key must be a list of exactly a name and a value, as `Headers` requires.
A string, a number, or a list of one or three items is no pair: the headers are left out of the
key, as the docs say, and no longer share a key with a valid pair.
