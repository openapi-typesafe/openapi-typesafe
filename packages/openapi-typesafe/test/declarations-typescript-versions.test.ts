import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The published declarations, checked as a consumer checks them (`skipLibCheck: false`) with the
 * consumer's own `typescript` package: 5.4 (the lowest supported, ADR-006), 6.x and 7.0. With
 * TypeScript 7, whose package has no compiler API, `ts.Node` was error TS2694 (ADR-032). Each
 * consumer gets a copy of `dist` in its own `node_modules`, so `typescript` resolves to the
 * version under test and not to this package's development compiler. Needs `pnpm run build`.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const TIMEOUT_MS = 60_000;
const workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-dts-")));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** The typed API without compiler nodes: what every consumer uses. */
const API_CONSUMER = `
import openapiTS, { astToString, COMMENT_HEADER, type OpenAPITSIrOptions } from "openapi-typesafe";

const options: OpenAPITSIrOptions = {
  irCallbacks: true,
  transform: (schema) => (schema.format === "date-time" ? "Date" : undefined),
};
export const text: string = COMMENT_HEADER + astToString(await openapiTS("openapi: 3.1.0", options));
`;

/** The deprecated compiler-node forms (ADR-004), with the consumer's TypeScript 5 or 6 API. */
const COMPILER_NODE_CONSUMER = `
import ts from "typescript";
import openapiTS, { astToString, QUESTION_TOKEN, tsEnum, type OpenAPITSOptions } from "openapi-typesafe";

const options: OpenAPITSOptions = {
  transform: () => ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
  postTransform: (type) =>
    ts.isUnionTypeNode(type) ? ts.factory.updateUnionTypeNode(type, type.types) : type,
  transformProperty: (property) =>
    ts.factory.updatePropertySignature(property, property.modifiers, property.name, QUESTION_TOKEN, property.type),
};
const declaration: ts.EnumDeclaration = tsEnum("Color", ["red"]);
export const text: string =
  astToString([declaration], { formatOptions: { newLine: ts.NewLineKind.LineFeed } }) +
  astToString(await openapiTS("openapi: 3.1.0", options));
`;

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["node"],
  },
  files: ["consumer.ts"],
};

/** The package directory of a module that this package or the workspace installs. */
function installedPackage(name: string): string {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [PACKAGE_ROOT] }));
}

function link(consumer: string, name: string, target: string): void {
  const linkPath = path.join(consumer, "node_modules", name);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(fs.realpathSync(target), linkPath, "dir");
}

/** A consumer project with this package's `dist`, its typed dependencies and one TypeScript. */
function createConsumer(name: string, typescriptPackage: string, source: string): string {
  const consumer = path.join(workDir, name);
  const installed = path.join(consumer, "node_modules/openapi-typesafe");
  fs.mkdirSync(installed, { recursive: true });
  fs.cpSync(path.join(PACKAGE_ROOT, "dist"), path.join(installed, "dist"), { recursive: true });
  fs.copyFileSync(path.join(PACKAGE_ROOT, "package.json"), path.join(installed, "package.json"));
  for (const dependency of ["@redocly/openapi-core", "ansi-colors", "@types/node", "@typescript/typescript6"]) {
    link(consumer, dependency, installedPackage(dependency));
  }
  link(consumer, "typescript", installedPackage(typescriptPackage));
  fs.writeFileSync(path.join(consumer, "package.json"), '{ "type": "module" }\n');
  fs.writeFileSync(path.join(consumer, "tsconfig.json"), JSON.stringify(TSCONFIG));
  fs.writeFileSync(path.join(consumer, "consumer.ts"), source);
  return consumer;
}

/**
 * `@redocly/openapi-core` 1.34 declarations import `json-schema-to-ts` and `js-yaml`, whose types it
 * does not install. openapi-typescript 7.13 has the same errors (docs/typescript-7.md).
 */
const INHERITED_REDOCLY_ERROR =
  /@redocly\/openapi-core\/.*error (TS2307: Cannot find module 'json-schema-to-ts'|TS7016: Could not find a declaration file for module 'js-yaml')/;

async function typeErrorsOf(consumer: string): Promise<string[]> {
  const tsc = path.join(consumer, "node_modules/typescript/bin/tsc");
  const result = await execa("node", [tsc, "-p", consumer], { cwd: consumer, reject: false });
  return result.stdout.split("\n").filter((line) => line.includes("error TS") && !INHERITED_REDOCLY_ERROR.test(line));
}

describe("published declarations with the consumer's TypeScript", () => {
  it.each([
    ["typescript-5.4", "5.4"],
    ["typescript", "6"],
    ["typescript-7.0", "7.0"],
  ])(
    "the API without compiler nodes type-checks with %s and skipLibCheck false",
    async (typescriptPackage, version) => {
      const consumer = createConsumer(`api-${version}`, typescriptPackage, API_CONSUMER);

      expect(await typeErrorsOf(consumer)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it.each([
    ["typescript-5.4", "5.4"],
    ["typescript", "6"],
  ])(
    "the compiler-node callbacks get the compiler's own node types with %s",
    async (typescriptPackage, version) => {
      const consumer = createConsumer(`nodes-${version}`, typescriptPackage, COMPILER_NODE_CONSUMER);

      expect(await typeErrorsOf(consumer)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "the compiler-node callbacks with @typescript/typescript6 type-check next to TypeScript 7.0",
    async () => {
      const source = COMPILER_NODE_CONSUMER.replace('from "typescript"', 'from "@typescript/typescript6"');
      const consumer = createConsumer("nodes-typescript6-on-7.0", "typescript-7.0", source);

      expect(await typeErrorsOf(consumer)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
