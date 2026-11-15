---
"openapi-typesafe-react-query": patch
---

A query key no longer throws while the component renders for a value it cannot read: a circular
body, a body member whose `toJSON` or getter throws, a revoked `Proxy`, a `toJSON` or `toISOString`
getter that throws, or header pairs with an item that is no pair. Such a value is left out of the
key, and the request reports the error as the query error.
