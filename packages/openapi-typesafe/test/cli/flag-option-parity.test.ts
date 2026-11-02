import { describe, expectTypeOf, it } from "vitest";
import type { GeneratorFlag } from "../../src/cli/cli-arguments.js";
import type { GeneratorOptions } from "../../src/index.js";

/** Every CLI flag is a Node API option of the same name (pre-beta test plan 5.2). */

describe("CLI flags and Node API options", () => {
  it("every generator flag is a boolean option of GeneratorOptions", () => {
    expectTypeOf<GeneratorFlag>().toExtend<keyof GeneratorOptions>();
    expectTypeOf<GeneratorOptions[GeneratorFlag]>().toEqualTypeOf<boolean | undefined>();
  });
});
