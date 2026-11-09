// `openapi-typesafe-fetch` declares the helper types in its `helpers` entry, and this package
// names them: one declaration, so a value typed with the names of one package fits the names of
// the other, also in generic code, where TypeScript compares two copies of a mapped or conditional
// type by declaration, not by shape (ADR-034). The declaration build turns `export type *` into
// `export *`; that entry has no runtime code, so both export the same names.
export type * from "openapi-typesafe-fetch/helpers";
