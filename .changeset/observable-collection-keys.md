---
"openapi-typesafe-react-query": patch
---

A MobX observable `Set` or `Map` in `params` or a body no longer sends requests without end from
an `observer` component. Its query key read the collection's own state, which MobX changes each
time the collection is read, so every render had a new key. A value that is a `Map` or a `Set`
by its type tag only is now keyed by its contents alone.
