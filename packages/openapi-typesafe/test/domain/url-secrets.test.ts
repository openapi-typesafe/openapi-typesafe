import { describe, expect, it } from "vitest";
import { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { redactUrlSecrets } from "../../src/domain/url-secrets.js";

describe("redactUrlSecrets", () => {
  it.each([
    [
      "Failed to load http://tok:pw@127.0.0.1:8080/x.yaml",
      "Failed to load http://***@127.0.0.1:8080/x.yaml",
    ],
    ["https://only-user@api.example/x.yaml#/a", "https://***@api.example/x.yaml#/a"],
    ["a http://a:b@h/ and https://c@d/", "a http://***@h/ and https://***@d/"],
    // No user info: an `@` in the path, query or fragment, or after a space, is left alone.
    ["https://api.example/users/@me?mail=a@b#@c", "https://api.example/users/@me?***#@c"],
    ["https://a:b@c@host/x", "https://***@host/x"],
    [
      "Cannot load https://api.example/s.yaml?api_key=SECRET#/a: 500",
      "Cannot load https://api.example/s.yaml?***#/a: 500",
    ],
    ['ref "https://h/x.yaml?sig=SECRET" failed', 'ref "https://h/x.yaml?***" failed'],
    ["https://h/x?a=1 and https://h/y?b=2", "https://h/x?*** and https://h/y?***"],
    ["https://h/x.yaml#/a?b", "https://h/x.yaml#/a?b"],
    ["see https://api.example me@example.com", "see https://api.example me@example.com"],
    ["no URL at all", "no URL at all"],
  ])("redactUrlSecrets(%j) is %j", (text, expected) => {
    expect(redactUrlSecrets(text)).toBe(expected);
  });

  it.each([
    ["`://`", "://"],
    ["`://?`", "://?"],
    ["`:// `", ":// "],
  ])("redactUrlSecrets is linear on a long run of %s", (_name, unit) => {
    const text = unit.repeat(200_000);
    const startedAt = performance.now();

    redactUrlSecrets(text);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("a typed error never carries the user info or the query of a URL in its message", () => {
    const error = new OpenAPITypesafeError({
      code: "SCHEMA_LOAD_FAILED",
      message: "Failed to load http://tok:SECRET@host/x.yaml?key=SECRET",
    });

    expect(error.message).toBe("Failed to load http://***@host/x.yaml?***");
  });
});
