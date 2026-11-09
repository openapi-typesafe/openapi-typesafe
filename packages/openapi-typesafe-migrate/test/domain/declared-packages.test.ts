import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { isMap } from "../../src/domain/config-documents.js";
import {
  declaredNames,
  type ManifestDeclarations,
  namesUninstalledPackage,
  undeclaredImportSteps,
} from "../../src/domain/declared-packages.js";
import type { Change } from "../../src/domain/migration-findings.js";

const HELPERS = "openapi-typesafe-helpers";
const INSTALLERS = ["openapi-fetch", "openapi-react-query"];

const renamed = (to: string, line = 1): Change => ({
  kind: "specifier-renamed",
  line,
  from: "openapi-typescript-helpers",
  to,
});

const manifest = (path: string, names: readonly string[] = []): ManifestDeclarations => ({
  path,
  names: new Set(names),
});

describe("undeclaredImportSteps", () => {
  it("undeclaredImportSteps reports a helpers import that no manifest above the file declares", () => {
    const manifests = [manifest("package.json", ["openapi-fetch"])];

    const steps = undeclaredImportSteps([renamed(HELPERS, 3)], "src/a.ts", manifests);

    expect(steps).toEqual([
      { kind: "package-not-declared", line: 3, name: HELPERS, installers: INSTALLERS },
    ]);
  });

  it("undeclaredImportSteps names the package of a subpath import", () => {
    const manifests = [manifest("package.json")];

    const steps = undeclaredImportSteps([renamed(`${HELPERS}/x`)], "a.ts", manifests);

    expect(steps.map((step) => step.kind === "package-not-declared" && step.name)).toEqual([
      HELPERS,
    ]);
  });

  it("undeclaredImportSteps accepts the old and the new name in the manifest", () => {
    const old = [manifest("package.json", ["openapi-typescript-helpers"])];
    const successor = [manifest("package.json", [HELPERS])];

    const steps = [old, successor].flatMap((manifests) =>
      undeclaredImportSteps([renamed(HELPERS)], "src/a.ts", manifests),
    );

    expect(steps).toEqual([]);
  });

  it("undeclaredImportSteps accepts a declaration of a workspace root above the package", () => {
    const manifests = [manifest("package.json", [HELPERS]), manifest("packages/a/package.json")];

    const steps = undeclaredImportSteps([renamed(HELPERS)], "packages/a/src/a.ts", manifests);

    expect(steps).toEqual([]);
  });

  it("undeclaredImportSteps does not count a declaration of a sibling package", () => {
    const manifests = [
      manifest("packages/a/package.json", [HELPERS]),
      manifest("packages/ab/package.json"),
    ];

    const steps = undeclaredImportSteps([renamed(HELPERS)], "packages/ab/src/a.ts", manifests);

    expect(steps).toHaveLength(1);
  });

  it("undeclaredImportSteps does not judge a file that no manifest contains", () => {
    const manifests = [manifest("packages/a/package.json")];

    const steps = undeclaredImportSteps([renamed(HELPERS)], "scripts/a.ts", manifests);

    expect(steps).toEqual([]);
  });

  it("undeclaredImportSteps counts a manifest it could not read as declaring every package", () => {
    const manifests = [{ path: "package.json", names: undefined }];

    const steps = undeclaredImportSteps([renamed(HELPERS)], "src/a.ts", manifests);

    expect(steps).toEqual([]);
  });

  it("undeclaredImportSteps leaves npm specifiers, other packages and other changes alone", () => {
    const manifests = [manifest("package.json")];
    const changes: Change[] = [
      renamed(`npm:${HELPERS}@^1.0.0`),
      renamed("openapi-typesafe-fetch"),
      { kind: "transform-rewritten", line: 2 },
    ];

    const steps = undeclaredImportSteps(changes, "src/a.ts", manifests);

    expect(steps).toEqual([]);
  });
});

describe("declaredNames", () => {
  it("declaredNames reads every dependency field of a manifest", () => {
    const text = JSON.stringify({
      dependencies: { a: "1" },
      devDependencies: { b: "1" },
      peerDependencies: { c: "1" },
      optionalDependencies: { d: "1" },
      overrides: { e: "1" },
    });
    const read = createJsonTextReader().read(text);
    const roots = read.kind === "read" ? read.documents.filter(isMap) : [];

    const names = roots.flatMap(declaredNames);

    expect(names).toEqual(["a", "b", "c", "d"]);
  });
});

describe("namesUninstalledPackage", () => {
  it("namesUninstalledPackage finds the old and the new name of the helpers", () => {
    const texts = ['{"openapi-typescript-helpers":"1"}', `{"${HELPERS}":"1"}`, '{"other":"1"}'];

    expect(texts.map(namesUninstalledPackage)).toEqual([true, true, false]);
  });
});
