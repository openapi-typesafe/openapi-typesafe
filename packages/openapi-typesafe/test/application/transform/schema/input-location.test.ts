import { describe, expect, it } from "vitest";
import { isInputLocation } from "../../../../src/application/transform/schema/input-location.js";
import { FIX, type OutputFix } from "../../../../src/domain/output-fixes.js";

const ORIGINAL: ReadonlySet<OutputFix> = new Set();
const STRUCTURAL: ReadonlySet<OutputFix> = new Set([FIX.DEFAULT_INPUT_LOCATIONS]);

describe("isInputLocation without the fix", () => {
  it.each([
    ["#/paths/~1items/get/parameters/query/page", true],
    ["#/paths/~1items/post/requestBody/content/application~1json/schema", true],
    ["#/components/requestBodies/Pet/content/application~1json/schema", true],
    ["#/paths/~1system-parameters/get/responses/200/content/application~1json/schema", true],
    ["#/components/schemas/Job/properties/hyperparameters", true],
    ["#/paths/~1items/get/responses/200/content/application~1json/schema", false],
    ["#/components/schemas/Job", false],
  ])("isInputLocation with %s is %s, as the original's words say", (path, expected) => {
    expect(isInputLocation(path, ORIGINAL)).toBe(expected);
  });

  it("isInputLocation without a path is false", () => {
    expect(isInputLocation(undefined, ORIGINAL)).toBe(false);
  });
});

describe("isInputLocation with the default-input-locations fix", () => {
  it.each([
    "#/paths/~1items/parameters/query/page",
    "#/paths/~1items/get/parameters/query/page",
    "#/paths/~1items/get/requestBody/content/application~1json/schema",
    "#/paths/~1items/query/requestBody/content/application~1json/schema",
    "#/paths/~1items/additionalOperations/COPY/parameters/query/page",
    "#/paths/~1items/post/callbacks/done/{$request.body#~1url}/post/requestBody",
    "#/webhooks/added/post/requestBody/content/application~1json/schema",
    "#/components/parameters/Page/schema",
    "#/components/requestBodies/Pet/content/application~1json/schema",
    "#/components/pathItems/Event/post/requestBody",
    "#/components/callbacks/Done/{$url}/post/parameters/header/id",
  ])("isInputLocation with %s is true", (path) => {
    expect(isInputLocation(path, STRUCTURAL)).toBe(true);
  });

  it.each([
    "#/paths/~1system-parameters/get/responses/200/content/application~1json/schema",
    "#/paths/~1parameters/get/responses/200",
    "#/paths/~1items/get/responses/200/headers/parameters",
    "#/paths/~1items/summary",
    "#/paths/~1items/x-parameters/parameters",
    "#/components/schemas/Job/properties/parameters",
    "#/components/schemas/job_parameters",
    "#/components/schemas/Job/properties/hyperparameters/properties/n_epochs",
    "#/components/responses/parameters",
    "#/webhooks/parameters/post/responses/200",
    "#/$defs/parameters",
    "#/paths",
    "#",
  ])("isInputLocation with %s is false", (path) => {
    expect(isInputLocation(path, STRUCTURAL)).toBe(false);
  });

  it("isInputLocation without a path is false", () => {
    expect(isInputLocation(undefined, STRUCTURAL)).toBe(false);
  });

  // An exported transformer may be given a path outside the document; the original's words apply.
  it.each([
    ["#/~1items~1{id}/parameters/query/page", true],
    ["#/parameters/query/page", true],
    ["#/~1items/requestBody", true],
    ["#/~1items/a/requestBodies", true],
    ["#/~1system-parameters/responses/200", true],
    ["#/~1items~1{id}/responses/200", false],
  ])("isInputLocation with the outside path %s is %s", (path, expected) => {
    expect(isInputLocation(path, STRUCTURAL)).toBe(expected);
  });
});
