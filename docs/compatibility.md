---

title: Compatibility report
description: How the output of openapi-typesafe compares with openapi-typescript 7.13 on 1,820 real-world schemas.
---

# Compatibility report

openapi-typesafe promises the same output as openapi-typescript 7.13, except where the output is a
bug. This page shows how that is checked and what the last run found.

**Result (2026-11-04):** 50,960 cases, 0 unexpected differences. 99.99% of the outputs are the
same byte for byte, and 100% have the same types.

## What is compared

- **Golden output:** openapi-typescript at commit `d46a319a` (tag `fork-base`), the code of the
  7.13.0 release. A separate run of 4,600 cases found it gives the same bytes as the published
  `openapi-typescript@7.13.0` on every document both can load.
- **Candidate:** the current openapi-typesafe generator.
- **Corpus:** 1,820 OpenAPI 3.x documents: the [APIs.guru](https://apis.guru) directory plus 20
  curated ones (the large GitHub, Stripe, OpenAI, Cloudflare, Twilio and Kubernetes APIs and the
  official OpenAPI examples, including 3.2). Each one is pinned by its SHA-256 hash.
- **Options:** 28 option sets: the defaults, every boolean flag on its own and the combinations
  that interact (`--enum` with `--enum-values`, `--root-types` with its naming flags, and others).
  1,820 × 28 = 50,960 cases.

For every case the tool generates the types with both generators and compares them in three steps:

1. **Bytes.** The files are compared as text. The header line that names the generator is
   ignored.
2. **Types.** If the bytes differ, each exported type is checked with a strict identity check: two
   types count as equal only if TypeScript sees them as identical, so `readonly` and `any` are
   not ignored.
3. **Compiles.** If the golden output itself does not compile, both outputs are type-checked with
   strict settings and the error counts are compared.

## Summary

| Result                         |  Cases | What it means                                                                                                                                                             |
| ------------------------------ | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same bytes                     | 49,794 | The output is the same file.                                                                                                                                              |
| Same types                     |      4 | `--enum-values` constants whose golden names start with a digit (not valid JavaScript) get a `value` prefix; every exported type is equal.                                |
| Different                      |      0 | —                                                                                                                                                                         |
| Golden output does not compile |    994 | openapi-typescript 7.13 writes TypeScript with errors; ours has no more errors, and 766 of these compile without any ([see below](#golden-output-that-does-not-compile)). |
| Golden generator fails         |    168 | openapi-typescript 7.13 stops with an error on 6 documents (see below).                                                                                                   |
| Candidate fails                |      0 | —                                                                                                                                                                         |

The rates count only cases where the golden output exists and compiles (49,798 cases): byte
identity **99.99%**, type identity **100%**, and **100%** of the golden types are kept.

### Documents the golden generator cannot load

These 6 documents fail in every option set (6 × 28 = 168 cases):

- 3 are OpenAPI 3.2 documents. The golden generator rejects 3.2; openapi-typesafe loads them and
  types the [3.2 features](/introduction#openapi-3-2-support) as well.
- 3 point to files or URLs that cannot be downloaded (a relative `$ref` outside the document, and
  a URL that returns HTTP 400). Both generators stop on them.

### Golden output that does not compile

These cases are not compared type by type: the golden file has TypeScript errors, so the check is
that ours has no more. They come from option combinations whose original output does not compile:

| Option set                                                               | Cases | Ours compiles | Cause                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----: | ------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--path-params-as-types`                                                 |   791 |           600 | A path template such as `` `/apps/${string}` `` also matches another path whose type does not fit; ours writes such templates in an intersection where the error is sure (see the [CLI docs](./cli.md#pathparamsastypes)). |
| `--make-paths-enum`                                                      |    81 |            78 | Paths that map to the same member name.                                                                                                                                                                                    |
| `--enum` (with `--enum-values`, `--dedupe-enums`, `--conditional-enums`) |   108 |            77 | Enum members whose names collide, which ours numbers, and names that start with a digit.                                                                                                                                   |
| `--exclude-deprecated`                                                   |    13 |            11 | A kept schema points to a deprecated one, which ours keeps.                                                                                                                                                                |
| `--root-types-keep-casing`                                               |     1 |             0 | A schema name that is not a valid identifier.                                                                                                                                                                              |

Where ours still has errors, it has no more than the golden output. In 2 of the 791 cases
(Microsoft Graph and Graph beta with `--path-params-as-types`, 24 MB each) TypeScript cannot finish
the check of either file: it stops with `RangeError: Map maximum size exceeded`, as a user's `tsc`
does; the default output of the same documents compiles.

## Intentional differences

Each change below fixes a bug and has a test and a changelog entry. Before comparing, the tool
applies the same change to the golden output, so a case that differs only by these counts as the
same. The table lists how many cases each change touched.

| Change                                                                                             | Fixes                                                                                                                                                                                                                                                                                                                                                             | Cases |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| `--enum`: an empty string value gets the member name `""` instead of none                          | [#2807](https://github.com/openapi-ts/openapi-typescript/issues/2807), [#2812](https://github.com/openapi-ts/openapi-typescript/issues/2812)                                                                                                                                                                                                                      |    93 |
| `--enum-values`: `FlattenedDeepRequired` flattens readonly arrays and nullable parents             | [#2714](https://github.com/openapi-ts/openapi-typescript/issues/2714), [#2737](https://github.com/openapi-ts/openapi-typescript/pull/2737)                                                                                                                                                                                                                        | 1,527 |
| `--enum-values`: the `ReadonlyArray` helper accepts readonly arrays                                | [#2749](https://github.com/openapi-ts/openapi-typescript/issues/2749)                                                                                                                                                                                                                                                                                             | 1,527 |
| `--read-write-markers`: `Readable` / `Writable` keep primitives, arrays, tuples and null-only keys | [#2615](https://github.com/openapi-ts/openapi-typescript/issues/2615), [#2620](https://github.com/openapi-ts/openapi-typescript/issues/2620), [#2632](https://github.com/openapi-ts/openapi-typescript/issues/2632), [#2717](https://github.com/openapi-ts/openapi-typescript/issues/2717), [#2765](https://github.com/openapi-ts/openapi-typescript/issues/2765) | 3,628 |
| `--enum`: a name that starts with a digit gets the `Value` prefix                                  | the golden output does not compile                                                                                                                                                                                                                                                                                                                                |    12 |
| `--root-types-keep-casing`: characters that cannot be in an identifier become `_`                  | the golden output does not compile                                                                                                                                                                                                                                                                                                                                |   151 |
| `--root-types-no-schema-prefix`: a schema name that starts with a digit keeps its prefix           | the golden output does not compile                                                                                                                                                                                                                                                                                                                                |     8 |

The [migration guide](./migration-guide.md) lists every change from openapi-typescript 7.13,
including the ones this corpus does not reach.

## Real projects

22 open-source projects that use openapi-typescript or openapi-fetch were checked out at a fixed
commit and run as they are, then again after switching to openapi-typesafe by package name only.
All 22 pass every step they had passed before (install, build, type check, tests, whatever the
project has), and all 18 files they generate are the same as before.

| Project                                                                        | Commit         |
| ------------------------------------------------------------------------------ | -------------- |
| [unsplash-js](https://github.com/unsplash/unsplash-js)                         | `de61b942e16a` |
| [swr-openapi](https://github.com/htunnicliff/swr-openapi)                      | `34d1e0dbb524` |
| [openapi-fetch-gen](https://github.com/moznion/openapi-fetch-gen)              | `1b2ec9ee05d2` |
| [vc-bots](https://github.com/Virtual-Coffee/vc-bots)                           | `0bfc54accbe4` |
| [org-roam-ui-lite](https://github.com/tani/org-roam-ui-lite)                   | `e036f5ee0a6f` |
| [acai-cli](https://github.com/acai-sh/cli)                                     | `6ec9df89dda3` |
| [obsidian-media-db](https://github.com/mProjectsCode/obsidian-media-db-plugin) | `81ff85560f2a` |
| [immich-discord-bot](https://github.com/immich-app/discord-bot)                | `a0369c113426` |
| [lichess-broadcaster](https://github.com/lichess-org/broadcaster)              | `e5a309199251` |
| [arena-cli](https://github.com/aredotna/cli)                                   | `63441ef27f72` |
| [whatsapp-js-sdk](https://github.com/great-detail/WhatsApp-JS-SDK)             | `240843d66159` |
| [permit-cli](https://github.com/permitio/permit-cli)                           | `745e8a3dc656` |
| [miro-code](https://github.com/clean-frontend/miro-code)                       | `f2226a240c56` |
| [immerle-ui](https://github.com/immerle/immerle)                               | `c715fb9f062c` |
| [vue-h5-template](https://github.com/sunniejs/vue-h5-template)                 | `a829261c3558` |
| [coderabbit-bitbucket](https://github.com/coderabbitai/bitbucket)              | `c39a1e9c37e7` |
| [vitrina-api](https://github.com/VitrinaDev/vitrina-api)                       | `ad69f0078de7` |
| [rootly-ts](https://github.com/rootlyhq/rootly-ts)                             | `dece1e2322e8` |
| [ai-dial-sdk](https://github.com/epam/ai-dial-typescript-sdk)                  | `1b23ddf8c449` |
| [sendly-js](https://github.com/DevinoSolutions/sendly-js)                      | `49a9c06140d7` |
| [forge-dashboard-sdk](https://github.com/alrayyes/forge-dashboard-sdk-node)    | `e1f00f9d8e9a` |
| [openapi-axios](https://github.com/web-bee-ru/openapi-axios)                   | `4fc0ddec4eed` |

## Run it yourself

The comparison tool lives in
[`tools/compat-harness`](https://github.com/openapi-typesafe/openapi-typesafe/tree/main/tools/compat-harness).
Its README explains how to download the corpus, build both generators and produce this report.
CI runs it on a 200-document subset with the default options for every pull request and push to
`main`, and on the full corpus with all 28 option sets every night.
