import { inspect, types } from "node:util";
import { describe, expect, it } from "vitest";
import { redactCauseSecrets } from "../../src/domain/cause-secrets.js";
import { OpenAPITypesafeError } from "../../src/domain/errors.js";

const SECRET = "token-0123456789";
const URL_WITH_SECRETS = `http://user:${SECRET}@127.0.0.1:1/spec.yaml?api_key=${SECRET}`;

describe("redactCauseSecrets", () => {
  it("redactCauseSecrets hides URL secrets in the message, stack and fields of an error", () => {
    const cause = Object.assign(new TypeError(`Invalid URL: ${URL_WITH_SECRETS}`), {
      code: "ERR_INVALID_URL",
      input: URL_WITH_SECRETS,
    });

    const redacted = redactCauseSecrets(cause) as TypeError & { code: string; input: string };

    expect(redacted).toBeInstanceOf(TypeError);
    expect(types.isNativeError(redacted)).toBe(true);
    expect(redacted.code).toBe("ERR_INVALID_URL");
    expect(redacted.input).toBe("http://***@127.0.0.1:1/spec.yaml?***");
    expect(redacted.stack).toMatch(
      /^TypeError: Invalid URL: http:\/\/\*\*\*@127\.0\.0\.1:1\/spec\.yaml\?\*\*\*\n/,
    );
    expect(inspect(redacted)).not.toContain(SECRET);
  });

  it("redactCauseSecrets hides URL secrets in every cause of the chain", () => {
    const inner = new Error(`connect ${URL_WITH_SECRETS}`);
    const outer = new Error("fetch failed", { cause: inner });

    const redacted = redactCauseSecrets(outer) as Error;

    expect((redacted.cause as Error).message).toBe("connect http://***@127.0.0.1:1/spec.yaml?***");
    expect(inspect(redacted)).not.toContain(SECRET);
  });

  it("redactCauseSecrets keeps an error without secrets as the same object", () => {
    const cause = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });

    expect(redactCauseSecrets(cause)).toBe(cause);
  });

  it("redactCauseSecrets hides a string cause and keeps any other value", () => {
    expect(redactCauseSecrets(URL_WITH_SECRETS)).toBe("http://***@127.0.0.1:1/spec.yaml?***");
    expect(redactCauseSecrets(42)).toBe(42);
  });

  it("redactCauseSecrets cuts a chain that loops back", () => {
    const first = new Error("first");
    const second = new Error(`second ${URL_WITH_SECRETS}`, { cause: first });
    Object.defineProperty(first, "cause", { value: second });

    const redacted = redactCauseSecrets(first) as Error;

    expect((redacted.cause as Error).cause as Error | undefined).toBeUndefined();
    expect(inspect(redacted)).not.toContain(SECRET);
  });

  it("redactCauseSecrets hides URL secrets in nested objects, arrays and errors", () => {
    const source = { absoluteRef: URL_WITH_SECRETS, lines: [URL_WITH_SECRETS] };
    const originalError = Object.assign(new SyntaxError(`bad YAML in "${URL_WITH_SECRETS}"`), {
      mark: { name: URL_WITH_SECRETS, line: 3 },
    });
    const cause = Object.assign(new Error("parse failed"), { source, originalError });

    const redacted = redactCauseSecrets(cause) as typeof cause;

    expect(redacted.source.absoluteRef).toBe("http://***@127.0.0.1:1/spec.yaml?***");
    expect(redacted.source.lines).toEqual(["http://***@127.0.0.1:1/spec.yaml?***"]);
    expect(redacted.originalError).toBeInstanceOf(SyntaxError);
    expect(redacted.originalError.mark).toEqual({
      name: "http://***@127.0.0.1:1/spec.yaml?***",
      line: 3,
    });
    expect(inspect(redacted, { depth: null })).not.toContain(SECRET);
  });

  it("redactCauseSecrets keeps nested values without secrets as the same objects", () => {
    const details = { list: ["a", 1], bytes: new Uint8Array([1]) };
    const cause = Object.assign(new Error("failed"), { details });

    expect(redactCauseSecrets(cause)).toBe(cause);
  });

  it("redactCauseSecrets drops values nested deeper than it walks", () => {
    let deep: Record<string, unknown> = { url: URL_WITH_SECRETS };
    for (let level = 0; level < 20; level += 1) {
      deep = { next: deep };
    }

    const redacted = redactCauseSecrets(deep);

    expect(inspect(redacted, { depth: null })).not.toContain(SECRET);
    expect(inspect(redacted, { depth: null })).toContain("next: undefined");
  });

  it("a typed error never carries a URL secret in its cause", () => {
    const error = new OpenAPITypesafeError({
      code: "SCHEMA_LOAD_FAILED",
      message: "fetch failed",
      cause: new TypeError(`Request cannot be constructed from ${URL_WITH_SECRETS}`),
    });

    expect(inspect(error)).not.toContain(SECRET);
  });
});
