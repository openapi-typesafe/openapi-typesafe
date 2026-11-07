import { describe, expectTypeOf, it } from "vitest";
import type { Method } from "../../src/index.js";

/** `HttpMethod` of openapi-typesafe-helpers, which the generator does not depend on (ADR-020). */
type HelpersHttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace" | "query";

describe("Method", () => {
  it("Method lists the same methods as HttpMethod of the helpers, query included", () => {
    expectTypeOf<Method>().toEqualTypeOf<HelpersHttpMethod>();
  });
});
