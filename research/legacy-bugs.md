# Fork-base bugs kept during the port

> Bugs found in the fork base while porting the transformers to IR (ENGINEERING_PLAN Phase 5). Phase 5 allows no
> behavior change, so each one is kept on purpose, with a comment at the code that keeps it. Input for Phase 7
> (tasks 7.4 and 7.6): each fix there changes output, so each needs a test, a changelog entry and a compatibility
> report entry.

| # | Where (ported code) | Bug | Effect |
|---|---|---|---|
| 1 | `application/transform/schema/enum-rule.ts` (`isTsEnum`) | The original meant to allow `null` in `--enum` enums but compared `typeof value` with `null`, which is never true | An enum with a `null` value stays a union of literals instead of becoming a TypeScript enum |
| 2 | `application/transform/footer/enum-naming.ts` (`EnumNaming`; the original: `sanitizeMemberName`, `tsEnumMember` in `lib/ts.ts`) | `JS_PROPERTY_INDEX_INVALID_CHARS_RE` has the `g` flag and is used with `.test()`, which keeps `lastIndex` between calls | Whether a trailing invalid character is removed from an enum name depends on the names converted before it; an invalid character can stay in the output. The port keeps this state per run (`isNextCheckSkipped`). Reproduced: `tsEnum` on `a-`, `b-`, `c-` in a row gives `A`, `B-` (invalid TypeScript), `C` |
| 3 | `lib/ts.ts` (`enumCache`) | `--dedupe-enums` uses a module-level cache that is never cleared | Two runs in one process share enums: the second run can reuse names from the first. **Fixed in Phase 5, step 6** (the plan requires it): the generator uses a per-run registry (`RunFooter`); only the public `tsEnum` still uses `enumCache`. Phase 7 still needs the changelog entry |
| 4 | `application/transform/document/parameters.ts` | `--alphabetize` sorts parameters with `localeCompare` and the default locale, while every other map uses the `en-us` numeric collator | Parameter order depends on the machine's locale and is not natural (`a10` before `a2`) |
| 5 | `application/transform/document/components.ts` (`rootTypeName`) | `--root-types` checks name conflicts before `--root-types-no-schema-prefix` removes the prefix | Two schemas can get the same alias, and the second silently replaces the first |
| 6 | `application/transform/document/components.ts` (`rootTypeAlias`) | Root aliases are written as text with single quotes: `components['schemas']['Pet']` | A schema name containing `'` produces invalid TypeScript |
| 7 | `application/transform/document/webhooks.ts` | A `$ref` webhook is read as a path item | The webhook type has every method as `never` instead of referencing the target |
| 8 | `application/transform/document/response.ts` | A `$ref` entry in a response's `content` is read as a media type without a schema | The media type is `unknown` instead of the referenced type (request bodies and headers resolve it) |
| 9 | `application/transform/document/parameters.ts` | A parameter without a `name` gets the key `"undefined"` | Invalid documents produce a bogus key instead of an error |
| 10 | `application/transform/document/paths.ts` (`pathTemplateText`) | `--path-params-as-types` writes the URL into a template literal without escaping a backtick, then parses the text with TypeScript | A URL with a backtick gives a broken key type (the literal ends at the backtick). **Fixed in Phase 6, task 6.6**: the backtick is escaped, so the key is the intended template literal type. The TypeScript parser is no longer used here |
