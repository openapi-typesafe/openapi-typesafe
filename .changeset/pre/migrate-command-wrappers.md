---
"openapi-typesafe-migrate": patch
---

The generator is renamed after more programs that run it: `nice`, `timeout`, `xargs`, `command`,
`exec -a`, `dotenvx run --`, `doppler run --`, `nx exec --`, `yarn workspace <name>`, a bare `bun`,
`corepack`, and `tsx` or `ts-node` before the path of its binary; `yarn global add` renames its
packages. Any other word of a command that names an old package or a path to its binary (a
script name after `npm run`, an argument of an unknown program, `$(npm bin)/openapi-typescript`)
is reported as a manual step. Such commands were left without a word, and
`dotenvx run -- npx openapi-typescript` kept downloading the old generator.
