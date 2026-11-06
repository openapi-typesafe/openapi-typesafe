import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseResolver,
  createConfig,
  type Document,
  detectSpec,
  getTypes,
  makeDocumentFromString,
  normalizeTypes,
  resolveDocument,
  Source,
} from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import { checkRefsResolve } from "../../../src/adapters/redocly-loader/ref-resolution-check.js";

/**
 * The check is a port of Redocly's `resolveDocument` (ADR-030): where only one lookup fails, both
 * must give the same outcome. Documents live in memory, behind a resolver that reads no files.
 */

const ROOT = "/api/openapi.yaml";
const FIXTURES = fileURLToPath(new URL("../../fixtures/", import.meta.url));

/** A resolver over in-memory files; a missing file fails to load, as a missing file on disk does. */
class InMemoryResolver extends BaseResolver {
  readonly #files: ReadonlyMap<string, string>;

  constructor(files: Record<string, string>) {
    super();
    this.#files = new Map(Object.entries(files));
  }

  override async loadExternalRef(absoluteRef: string): Promise<Source> {
    const text = this.#files.get(absoluteRef);
    if (text === undefined) {
      throw new Error(`ENOENT: ${absoluteRef}`);
    }
    return new Source(absoluteRef, text);
  }
}

const styleguide = (await createConfig({}, { extends: ["minimal"] })).styleguide;

function rootTypeOf(document: Document) {
  const spec = detectSpec(document.parsed);
  return normalizeTypes(styleguide.extendTypes(getTypes(spec), spec), styleguide).Root;
}

async function outcomeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "resolves";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

/** The outcome of the check and of Redocly's own resolution, each with a fresh resolver. */
async function outcomes(root: string, files: Record<string, string> = {}) {
  const document = makeDocumentFromString(root, ROOT) as Document;
  const check = await outcomeOf(() =>
    checkRefsResolve(document, new InMemoryResolver(files), styleguide),
  );
  const redocly = await outcomeOf(() =>
    resolveDocument({
      rootDocument: document,
      rootType: rootTypeOf(document) as never,
      externalRefResolver: new InMemoryResolver(files),
    }),
  );
  return { check, redocly };
}

const DOCUMENT_START = 'openapi: 3.1.0\ninfo: {title: t, version: "1"}\n';

function documentWithSchemas(schemas: string): string {
  return `${DOCUMENT_START}paths: {}\ncomponents:\n  schemas:\n${schemas}`;
}

describe("checkRefsResolve", () => {
  it.each([
    [
      "a ref through another ref",
      "    Alias: {$ref: '#/components/schemas/B'}\n    B: {properties: {x: {type: string}}}\n    C: {$ref: '#/components/schemas/Alias/properties/x'}\n",
    ],
    ["an anchor ref", "    Node: {$anchor: node, type: object}\n    User: {$ref: '#node'}\n"],
    ["a pointer to nothing", "    A: {$ref: '#/nope/deeper'}\n"],
    ["a pointer through text", "    A: {$ref: '#/info/title/x'}\n"],
    [
      "a pointer through a ref to text",
      "    T: {$ref: '#/info/title'}\n    A: {$ref: '#/components/schemas/T/x'}\n",
    ],
    [
      "a pointer through a ref to nothing",
      "    T: {$ref: '#/nope'}\n    A: {$ref: '#/components/schemas/T/x'}\n",
    ],
    ["a missing file", "    A: {$ref: './missing.yaml#/A'}\n"],
    [
      "a ref through a missing file",
      "    T: {$ref: './missing.yaml'}\n    A: {$ref: '#/components/schemas/T/x'}\n",
    ],
    ["a self-referencing schema", "    A: {$ref: '#/components/schemas/A'}\n"],
    [
      "a ring of refs",
      "    A: {$ref: '#/components/schemas/B'}\n    B: {$ref: '#/components/schemas/A'}\n",
    ],
    ["a malformed escape", "    A: {$ref: '#/components/schemas/50%'}\n"],
    ["a malformed escape in an extension", "    A: {x-list: [{$ref: '#/a%'}]}\n"],
    [
      "a pointer through null",
      "    N: {properties: {p: null}}\n    A: {$ref: '#/components/schemas/N/properties/p/x'}\n",
    ],
    ["a key named like an Object method", "    A: {properties: {valueOf: {type: string}}}\n"],
  ])(
    "checkRefsResolve with %s has the outcome of Redocly's resolveDocument",
    async (_name, schemas) => {
      const { check, redocly } = await outcomes(documentWithSchemas(schemas));

      expect(check).toBe(redocly);
    },
  );

  it("checkRefsResolve with an example whose externalValue is missing resolves, as Redocly does", async () => {
    const root = `${DOCUMENT_START}paths: {}\ncomponents:\n  examples:\n    E: {externalValue: ./missing.json}\n`;

    expect(await outcomes(root)).toEqual({ check: "resolves", redocly: "resolves" });
  });

  it("checkRefsResolve with a discriminator mapping to a ring in another file fails with the cycle", async () => {
    const schemas =
      "    P: {oneOf: [{type: object}], discriminator: {propertyName: k, mapping: {a: './b.yaml#/S'}}}\n";
    const files = { "/api/b.yaml": "S: {$ref: '#/S'}\n" };

    const { check } = await outcomes(documentWithSchemas(schemas), files);

    expect(check).toBe("Error: Self-referencing circular pointer");
  });

  it("checkRefsResolve with failures in two files fails with the first and waits for the other", async () => {
    const root = `${DOCUMENT_START}paths:\n  /a:\n    get:\n      responses:\n        "200": {$ref: './b.yaml#/B'}\n        "201": {$ref: './b.yaml#/C'}\n`;
    const files = { "/api/b.yaml": "B: {$ref: '#/B'}\nC: {description: c, x-n: {$ref: '#/B'}}\n" };

    const check = await outcomeOf(() =>
      checkRefsResolve(
        makeDocumentFromString(root, ROOT) as Document,
        new InMemoryResolver(files),
        styleguide,
      ),
    );

    expect(check).toBe("Error: Self-referencing circular pointer");
  });

  it("checkRefsResolve loads documents into the resolver cache, so Redocly reads them once", async () => {
    const resolver = new InMemoryResolver({ "/api/b.yaml": "B: {type: string}\n" });
    const document = makeDocumentFromString(
      documentWithSchemas("    A: {$ref: './b.yaml#/B'}\n"),
      ROOT,
    );

    await checkRefsResolve(document as Document, resolver, styleguide);

    expect([...resolver.cache.keys()]).toEqual(["/api/b.yaml"]);
  });

  const fixtureDocuments = fs
    .readdirSync(FIXTURES)
    .filter(
      (name) =>
        name.endsWith(".yaml") &&
        fs.readFileSync(path.join(FIXTURES, name), "utf8").startsWith("openapi:"),
    );

  it.each(fixtureDocuments)(
    "checkRefsResolve with fixture %s has the outcome of Redocly",
    async (name) => {
      const file = path.join(FIXTURES, name);
      const document = makeDocumentFromString(fs.readFileSync(file, "utf8"), file) as Document;

      const check = await outcomeOf(() =>
        checkRefsResolve(document, new BaseResolver(), styleguide),
      );
      const redocly = await outcomeOf(() =>
        resolveDocument({
          rootDocument: document,
          rootType: rootTypeOf(document) as never,
          externalRefResolver: new BaseResolver(),
        }),
      );

      expect(check).toBe(redocly);
    },
  );
});
