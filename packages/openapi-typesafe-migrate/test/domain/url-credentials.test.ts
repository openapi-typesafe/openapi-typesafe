import { describe, expect, it } from "vitest";
import { hideUrlCredentials } from "../../src/domain/url-credentials.js";

describe("hideUrlCredentials", () => {
  it("hideUrlCredentials hides a token and a user with a password", () => {
    expect(hideUrlCredentials("git+https://ghp_SECRET@github.com/acme/api.git")).toBe(
      "git+https://***@github.com/acme/api.git",
    );
    expect(hideUrlCredentials("https://user:pass@npm.acme/x.tgz")).toBe(
      "https://***@npm.acme/x.tgz",
    );
  });

  it("hideUrlCredentials hides the credentials of every URL in a text", () => {
    expect(hideUrlCredentials('at "https://a@x.io/p" and ssh://b:c@y.io:22?q=1#f')).toBe(
      'at "https://***@x.io/p" and ssh://***@y.io:22?q=1#f',
    );
  });

  it("hideUrlCredentials hides up to the last @ of the authority", () => {
    expect(hideUrlCredentials("https://u@x:p@ss@host.io/@path")).toBe("https://***@host.io/@path");
  });

  it("hideUrlCredentials keeps text without credentials", () => {
    for (const text of [
      "^0.13.1",
      "https://registry.npmjs.org/openapi-fetch/-/openapi-fetch-0.13.1.tgz",
      "github:acme/api#v1",
      "git@github.com:acme/api.git",
      "npm:openapi-fetch@0.13.1",
      "https://host.io/a@b",
      "file://",
    ]) {
      expect(hideUrlCredentials(text)).toBe(text);
    }
  });

  it("hideUrlCredentials takes linear time on many schemes without an authority end", () => {
    const text = "a://".repeat(200_000);
    const started = performance.now();

    expect(hideUrlCredentials(text)).toBe(text);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
