---
"openapi-typesafe": patch
---

With `--path-params-as-types`, output where a template also matches a path whose type differs in
a union, an array item, a tuple or a property type other than an object compiles. It gave TS2413
for 66 documents of the APIs.guru corpus, Magento and Microsoft Graph among them (upstream #1752):
the overlap check read only methods, parameter locations and required properties. It now compares
the types the way TypeScript does and writes such a template in an object of its own. Output that
compiled is unchanged.
