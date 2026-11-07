import { describe, expect, it } from "vitest";
import { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { redactUrlCredentials } from "../../src/domain/url-credentials.js";

describe("redactUrlCredentials", () => {
  it.each([
    [
      "Failed to load http://tok:pw@127.0.0.1:8080/x.yaml",
      "Failed to load http://***@127.0.0.1:8080/x.yaml",
    ],
    ["https://only-user@api.example/x.yaml#/a", "https://***@api.example/x.yaml#/a"],
    ["a http://a:b@h/ and https://c@d/", "a http://***@h/ and https://***@d/"],
    // No user info: an `@` in the path, query or fragment, or after a space, is left alone.
    ["https://api.example/users/@me?mail=a@b#@c", "https://api.example/users/@me?mail=a@b#@c"],
    ["see https://api.example me@example.com", "see https://api.example me@example.com"],
    ["no URL at all", "no URL at all"],
  ])("redactUrlCredentials(%j) is %j", (text, expected) => {
    expect(redactUrlCredentials(text)).toBe(expected);
  });

  it("redactUrlCredentials is linear on a long run of `://`", () => {
    const text = "://".repeat(200_000);
    const startedAt = performance.now();

    redactUrlCredentials(text);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("a typed error never carries URL credentials in its message", () => {
    const error = new OpenAPITypesafeError({
      code: "SCHEMA_LOAD_FAILED",
      message: "Failed to load http://tok:SECRET@host/x.yaml",
    });

    expect(error.message).toBe("Failed to load http://***@host/x.yaml");
  });
});
