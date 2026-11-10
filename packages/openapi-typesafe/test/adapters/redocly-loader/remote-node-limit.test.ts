import { Source } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import {
  isParsedSource,
  RemoteNodeLimit,
} from "../../../src/adapters/redocly-loader/remote-node-limit.js";

const URL_BASE = "https://a.test";

function source(name: string, body: string, mimeType?: string): Source {
  return new Source(`${URL_BASE}/${name}`, body, mimeType);
}

describe("RemoteNodeLimit", () => {
  it("parse of a document within the limit gives the parsed document", () => {
    const limit = new RemoteNodeLimit(10);

    expect(limit.parse(source("a.yaml", "a: [1, 2]")).parsed).toEqual({ a: [1, 2] });
  });

  it("parse counts the nodes of every document of the load and fails past the limit", () => {
    const limit = new RemoteNodeLimit(6);
    limit.parse(source("a.json", "[1, 2]"));

    expect(() => limit.parse(source("b.json", "[1, 2, 3, 4]"))).toThrow(
      expect.objectContaining({
        code: "SCHEMA_REF_FORBIDDEN",
        details: {
          ref: `${URL_BASE}/b.json`,
          reason: "remote-documents-too-many-nodes",
          maxNodes: 6,
        },
      }),
    );
  });

  it("parse stops a dense document before it is parsed whole", () => {
    const limit = new RemoteNodeLimit(1000);
    const dense = `[${"{},".repeat(1_000_000)}{}]`;

    expect(() => limit.parse(source("dense.json", dense))).toThrow(
      expect.objectContaining({ code: "SCHEMA_REF_FORBIDDEN" }),
    );
  });
});

describe("isParsedSource", () => {
  it("isParsedSource follows Redocly: the root, a YAML or JSON name, or a YAML or JSON type", () => {
    expect(isParsedSource(source("a.txt", ""), true)).toBe(true);
    expect(isParsedSource(source("a.yml", ""), false)).toBe(true);
    expect(isParsedSource(source("a", "", "application/openapi+json"), false)).toBe(true);
    expect(isParsedSource(source("a.txt", "", "text/plain"), false)).toBe(false);
    expect(isParsedSource(source("a.txt", ""), false)).toBe(false);
  });

  it("isParsedSource reads the extension of a URL's path, without the query and fragment", () => {
    expect(isParsedSource(source("a.yaml?token=x", "", "text/plain"), false)).toBe(true);
    expect(isParsedSource(source("a.md?v=1.yaml", "", "text/plain"), false)).toBe(false);
    expect(isParsedSource(source("v1.2/a.md", "", "text/plain"), false)).toBe(false);
  });

  it("isParsedSource parses a URL whose path has no extension, but not such a local file", () => {
    expect(isParsedSource(source("schemas/pet", "", "text/plain"), false)).toBe(true);
    expect(isParsedSource(source("v1.2/pet?x=a.md", "", "text/plain"), false)).toBe(true);
    expect(isParsedSource(new Source("/work/schemas/pet", ""), false)).toBe(false);
  });

  it("isParsedSource parses a URL whose extension names no text format", () => {
    expect(isParsedSource(source("schemas/v1.0", "", "text/plain"), false)).toBe(true);
    expect(isParsedSource(source("schemas/pet.v2", "", "text/plain"), false)).toBe(true);
    expect(isParsedSource(new Source("/work/schemas/pet.v2", ""), false)).toBe(false);
  });

  it.each(["a.md", "a.markdown", "a.txt", "a.html", "a.htm"])(
    "isParsedSource keeps the text format %s as text",
    (name) => {
      expect(isParsedSource(source(name, "", "text/plain"), false)).toBe(false);
    },
  );

  it.each(["text/markdown", "text/x-markdown; charset=utf-8", "text/html"])(
    "isParsedSource keeps a URL of type %s as text",
    (mimeType) => {
      expect(isParsedSource(source("docs/intro", "", mimeType), false)).toBe(false);
    },
  );
});
