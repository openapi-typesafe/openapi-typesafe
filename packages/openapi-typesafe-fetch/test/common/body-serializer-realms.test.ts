import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { defaultBodySerializer } from "../../src/index.js";

/**
 * Headers built in another JavaScript realm (an iframe, `node:vm`, Jest VM modules) have a `get`
 * method that is not an `instanceof Function` of this realm. The serializer then read the headers as
 * a plain object and missed the form content type (upstream #2637).
 */

const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

describe("defaultBodySerializer with headers from another realm", () => {
  it("defaultBodySerializer reads the content type through a foreign get method", () => {
    const headers = runInNewContext(
      `({ get: (name) => (name === "Content-Type" ? "${FORM_CONTENT_TYPE}" : null) })`,
    ) as Headers;

    expect(defaultBodySerializer({ a: "1", b: "2" }, headers)).toBe("a=1&b=2");
  });
});
