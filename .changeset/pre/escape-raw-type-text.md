---
"openapi-typesafe": patch
---

Security: document text can no longer add code to the generated file. With `--root-types`, a quote, backslash or line break in a component name is now escaped in `components['schemas']['…']`. Before, a name such as `A']; export const x = 1; //` added its own declaration. With `--path-params-as-types`, backslashes, `${` and carriage returns in a URL are now escaped in the template literal key; before, a backslash before a backtick ended the literal. Output for other names and URLs is unchanged.
