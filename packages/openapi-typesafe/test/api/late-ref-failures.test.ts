import { afterEach, beforeEach, describe, expect, it } from "vitest";
import openapiTS, { type OpenAPITypesafeError } from "../../src/index.js";

/**
 * Redocly stops waiting at the first `$ref` that fails to resolve. Lookups it started later used to
 * fail with nobody waiting for them: an unhandled rejection, which ends a Node.js process. Each
 * fixture fails in the root document and again in a second document that loads in parallel.
 */

const FIXTURES = new URL("../fixtures/late-ref-failures/", import.meta.url);

/** Long enough for the second document to be read and walked after the first failure. */
const LATE_FAILURE_WAIT_MS = 200;

const unhandled: unknown[] = [];
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", recordUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", recordUnhandled);
});

async function failureOf(fixture: string): Promise<OpenAPITypesafeError> {
  try {
    await openapiTS(new URL(`${fixture}/api.yaml`, FIXTURES), { silent: true });
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("openapiTS should have failed");
}

function waitForLateFailures(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATE_FAILURE_WAIT_MS));
}

describe("a $ref failure in more than one document", () => {
  it.each([
    ["self-ref", "SCHEMA_REF_INVALID", { reason: "cycle" }],
    ["external-cycle", "SCHEMA_REF_INVALID", { reason: "cycle" }],
    ["malformed-ref", "SCHEMA_REF_INVALID", { reason: "malformed" }],
    ["unsupported-key", "SCHEMA_KEY_UNSUPPORTED", {}],
  ])("openapiTS with %s rejects once with %s and leaves no unhandled rejection", async (fixture, code, details) => {
    const error = await failureOf(fixture);
    await waitForLateFailures();

    expect(error).toMatchObject({ code, details });
    expect(unhandled).toEqual([]);
  });
});
