import { describe, expect, it } from "vitest";
import { OpenAPITypesafeError } from "../../src/domain/errors.js";
import {
  redactLocationSecrets,
  redactUnparsedUrl,
  redactUrlSecrets,
} from "../../src/domain/url-secrets.js";

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
    ["see <https://h/x.yaml?sig=SECRET> now", "see <https://h/x.yaml?***> now"],
    ["https://h/x?a=1 and https://h/y?b=2", "https://h/x?*** and https://h/y?***"],
    ["https://h/x.yaml#/a?b", "https://h/x.yaml#/a?b"],
    ["see https://api.example me@example.com", "see https://api.example me@example.com"],
    ["no URL at all", "no URL at all"],
    // Punctuation after a URL belongs to the message, also after a hidden query.
    ["load https://h/x.yaml?key=SECRET: 404", "load https://h/x.yaml?***: 404"],
    ["(https://h/x.yaml?key=SECRET).", "(https://h/x.yaml?***)."],
    ["https://a:b@h, then", "https://***@h, then"],
    // A URL that the loader fetches without `//`: its query and user info are hidden too.
    ["load http:h/x.yaml?key=SECRET: 404", "load http:h/x.yaml?***: 404"],
    ["HTTP:\\\\tok:pw@h\\x?key=SECRET", "HTTP:\\\\***@h\\x?***"],
    ["(https:/h/x?key=SECRET).", "(https:/h/x?***)."],
    ["see http:h/x me@example.com", "see http:h/x me@example.com"],
    // A `://` in the query of such a URL does not start a URL there.
    ["load http:h/x.yaml?key=SECRET&next=http://h2/y", "load http:h/x.yaml?***"],
    ["load https://h/x.yaml?key=SECRET&next=http:h2/y?b=1", "load https://h/x.yaml?***"],
    // A scheme after other text or a bare `://` still starts a URL.
    ["at:https://h/x?key=SECRET", "at:https://h/x?***"],
    ["1http://h/x?key=SECRET", "1http://h/x?***"],
    ["a://tok:pw@h/x?key=SECRET", "a://***@h/x?***"],
    ["x.yaml: bad http: value?", "x.yaml: bad http: value?"],
    ["Pass http:, https: or file:", "Pass http:, https: or file:"],
    ["wrote out:v2.ts?x", "wrote out:v2.ts?x"],
    ["load s3://tok:pw@bucket/x?key=SECRET", "load s3://***@bucket/x?***"],
  ])("redactUrlSecrets(%j) is %j", (text, expected) => {
    expect(redactUrlSecrets(text)).toBe(expected);
  });

  it.each([
    ["`://`", "://"],
    ["`://?`", "://?"],
    ["`:// `", ":// "],
    ["`://.`", "://."],
    ["`://. `", "://. "],
    ["`ab:`", "ab:"],
    ["`http:`", "http:"],
    ["`http:.`", "http:."],
    ["`ab:/`", "ab:/"],
    ["`1a://`", "1a://"],
    ["`a.b-`", "a.b-"],
    ["`http:!`", "http:!"],
    ["`!`", "!"],
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

describe("redactUnparsedUrl", () => {
  it.each([
    ["http://user:ab/cd@127.0.0.1:1/spec.yaml", "http://***@127.0.0.1:1/spec.yaml"],
    ["http://tok:SECRET@[::1/x.yaml?key=SECRET#/a", "http://***@[::1/x.yaml?***#/a"],
    ["http://exa mple.com/x.yaml", "http://exa mple.com/x.yaml"],
    ["https://h/x?mail=a@b", "https://h/x?***"],
    ["not a URL", "not a URL"],
    ["http:[::1/x?key=SECRET", "http:[::1/x?***"],
    ["http:tok:SECRET@[::1/x?key=SECRET", "http:***@[::1/x?***"],
    ["http:\\\\user:ab/cd@[::1\\x", "http:\\\\***@[::1\\x"],
    ["file:\\\\tok:pw@[::1\\x", "file:\\\\***@[::1\\x"],
    ["out:v2.ts?x@y", "out:v2.ts?x@y"],
  ])("redactUnparsedUrl(%j) is %j", (text, expected) => {
    expect(redactUnparsedUrl(text)).toBe(expected);
  });
});

describe("redactLocationSecrets", () => {
  it.each([
    ["http://h/my pet.yaml?key=SECRET", "http://h/my pet.yaml?***"],
    ["http://tok:pw@h/my pet.yaml", "http://***@h/my pet.yaml"],
    ['https://h/a"b.yaml?key=SECRET#/x', 'https://h/a"b.yaml?***#/x'],
    ["https://h/users/@me/pet.yaml", "https://h/users/@me/pet.yaml"],
    ["s3://user:ab/cd@bucket/pet.yaml", "s3://***@bucket/pet.yaml"],
    ["/specs/my pet.yaml?x", "/specs/my pet.yaml?x"],
    ["C:/specs/my pet.yaml?x", "C:/specs/my pet.yaml?x"],
    // A URL by the loader's rule, written without `//`, as the loader fetches it.
    ["http:h/my pet.yaml?key=SECRET", "http:h/my pet.yaml?***"],
    ["http:/h/x.yaml?key=SECRET", "http:/h/x.yaml?***"],
    ["http:\\\\h\\x.yaml?key=SECRET", "http:\\\\h\\x.yaml?***"],
    ["HTTP:h/x.yaml?key=SECRET", "HTTP:h/x.yaml?***"],
    ["https:h/x.yaml?key=SECRET#/a", "https:h/x.yaml?***#/a"],
    ["http:tok:pw@h/x.yaml", "http:***@h/x.yaml"],
    ["http:\\\\tok:pw@h\\x.yaml", "http:\\\\***@h\\x.yaml"],
    ["http:tok:pw@h\\users\\@me.yaml", "http:***@h\\users\\@me.yaml"],
    ["http:h/x.yaml?key=SECRET&next=http://h2/y", "http:h/x.yaml?***"],
    ["file:x.yaml?key=SECRET", "file:x.yaml?***"],
    // An `@` outside the user info that the URL parser finds is part of the name.
    ["http:h/users/@me/x.yaml", "http:h/users/@me/x.yaml"],
    ["http:h\\@me.yaml", "http:h\\@me.yaml"],
    ["file:a@b/x.yaml", "file:a@b/x.yaml"],
    ["s3://tok:pw@bucket/x.yaml?key=SECRET", "s3://***@bucket/x.yaml?***"],
    // A path by the loader's rule stays as written, also with a `://` in it.
    ["specs/http://h/x.yaml?x", "specs/http://h/x.yaml?x"],
    ["out:v2.ts?x", "out:v2.ts?x"],
    ["s3:/bucket/x.yaml?x", "s3:/bucket/x.yaml?x"],
  ])("redactLocationSecrets(%j) is %j", (location, expected) => {
    expect(redactLocationSecrets(location)).toBe(expected);
  });
});
