import { describe, expect, it } from "vitest";
import { isOpenAPITypesafeError } from "../../src/domain/errors.js";
import {
  ALL_OUTPUT_FIXES,
  ineffectiveFixNotices,
  OUTPUT_FIXES,
  outputFixNamesOf,
  resolveOutputFixes,
} from "../../src/domain/output-fixes.js";

describe("outputFixNamesOf", () => {
  it("outputFixNamesOf with known names returns them as given", () => {
    expect(outputFixNamesOf(["allof-required", "all"])).toEqual(["allof-required", "all"]);
  });

  it("outputFixNamesOf with unknown values fails with every unknown one and the known names", () => {
    let error: unknown;

    try {
      outputFixNamesOf(["allof-required", "nope", 1]);
    } catch (thrown) {
      error = thrown;
    }

    expect(isOpenAPITypesafeError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "OPTION_FIX_UNKNOWN",
      message:
        'Unknown fix "nope", 1. Known fixes: allof-discriminated-union, allof-required, anyof-oneof-descriptions, anyof-oneof-required, anyof-properties, array-length-tuples, dedupe-enum-names, discriminator-member-required, discriminator-values, exploded-query-objects, nullable-enums, path-param-type-names, prefix-items, read-write-refs, ref-pointers, root-type-numbering, unevaluated-properties, all.',
      details: { unknown: ["nope", 1], known: [...OUTPUT_FIXES, ALL_OUTPUT_FIXES] },
    });
  });
});

describe("resolveOutputFixes", () => {
  it("resolveOutputFixes with no names turns on nothing", () => {
    expect(resolveOutputFixes([])).toEqual(new Set());
  });

  it("resolveOutputFixes with all turns on every fix once", () => {
    expect(resolveOutputFixes(["all", "allof-required"])).toEqual(new Set(OUTPUT_FIXES));
  });
});

describe("ineffectiveFixNotices", () => {
  const NO_ROOT_TYPES =
    'Fix "root-type-numbering" has no effect without rootTypes (--root-types) and ' +
    "rootTypesNoSchemaPrefix (--root-types-no-schema-prefix)";

  it("ineffectiveFixNotices with every needed option off names them all", () => {
    expect(ineffectiveFixNotices(["root-type-numbering"], () => false)).toEqual([NO_ROOT_TYPES]);
  });

  it("ineffectiveFixNotices with one needed option off names only that one", () => {
    const isOn = (option: string) => option === "rootTypes";

    expect(ineffectiveFixNotices(["root-type-numbering"], isOn)).toEqual([
      'Fix "root-type-numbering" has no effect without rootTypesNoSchemaPrefix (--root-types-no-schema-prefix)',
    ]);
  });

  it("ineffectiveFixNotices with the enum fixes and --enum off names --enum", () => {
    const isOn = (option: string) => option === "dedupeEnums";

    expect(ineffectiveFixNotices(["nullable-enums", "dedupe-enum-names"], isOn)).toEqual([
      'Fix "nullable-enums" has no effect without enum (--enum)',
      'Fix "dedupe-enum-names" has no effect without enum (--enum)',
    ]);
  });

  it("ineffectiveFixNotices with path-param-type-names and the flag off names the flag", () => {
    expect(ineffectiveFixNotices(["path-param-type-names"], () => false)).toEqual([
      'Fix "path-param-type-names" has no effect without pathParamsAsTypes (--path-params-as-types)',
    ]);
  });

  it("ineffectiveFixNotices with the needed options on, all, or a fix without needs gives none", () => {
    expect(ineffectiveFixNotices(["root-type-numbering"], () => true)).toEqual([]);
    expect(ineffectiveFixNotices(["all", "allof-required"], () => false)).toEqual([]);
  });
});
