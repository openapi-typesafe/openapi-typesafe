import { describe, expect, expectTypeOf, it } from "vitest";
import { defaultBodySerializer } from "../../src/index.js";

/**
 * Spaces and tabs before the `;` of a media type's parameters (OWS, RFC 9110, section 8.3.1). The
 * JSON check took them, but `application/x-www-form-urlencoded ; charset=utf-8` and
 * `multipart/form-data ;…` turned an object into JSON instead of a form.
 */

const FORM = { name: "Ada", role: "admin" };

describe("a form media type with spaces before its parameters", () => {
  it("a URL-encoded Content-Type with a space before ; gives form data", () => {
    const headers = { "Content-Type": "application/x-www-form-urlencoded ; charset=utf-8" };

    expect(defaultBodySerializer(FORM, headers)).toBe("name=Ada&role=admin");
  });

  it("a multipart Content-Type with a tab before ; gives FormData", () => {
    const body = defaultBodySerializer(FORM, {
      "Content-Type": "multipart/form-data\t; charset=utf-8",
    });

    expectTypeOf(body).toEqualTypeOf<FormData>();
    expect(body).toBeInstanceOf(FormData);
    expect([...(body as FormData).entries()]).toEqual(Object.entries(FORM));
  });

  it("a multipart Content-Type with spaces before its end gives FormData", () => {
    const body = defaultBodySerializer(FORM, { "Content-Type": "Multipart/Form-Data  " });

    expectTypeOf(body).toEqualTypeOf<FormData>();
    expect(body).toBeInstanceOf(FormData);
  });

  it("another media type that starts like multipart is not a form", () => {
    const body = defaultBodySerializer(FORM, { "Content-Type": "multipart/form-data-x" });

    expectTypeOf(body).toEqualTypeOf<string>();
    expect(body).toBe(JSON.stringify(FORM));
  });
});
