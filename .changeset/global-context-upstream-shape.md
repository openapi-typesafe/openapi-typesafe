---
"openapi-typesafe": patch
---

`GlobalContext` accepts a context built with the fields of openapi-typescript 7.13 again: the new
fields `binaryAsBlob` and `irCallbacks` are optional (default `false`). Before, such a context,
which calling an exported transformer outside a run needs, failed with error TS2739. The run's own
state (`runFooter`, `logger`, `legacyCallbackWarnings` and two discriminator maps) is no longer
part of the public type; the generator still keeps it on the context object it passes to the
callbacks as `options.ctx`.
