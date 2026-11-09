import { describe, expect, it } from "vitest";
import { manualStepMessage } from "../../src/application/manual-step-messages.js";
import type { ManualStep } from "../../src/domain/migration-findings.js";

const STEPS: readonly ManualStep[] = [
  { kind: "config-unreadable", position: { line: 3, column: 7 } },
  { kind: "config-unreadable", position: undefined },
  { kind: "manifest-not-read" },
  { kind: "old-package-patch", name: "openapi-fetch", to: "openapi-typesafe-fetch" },
  { kind: "import-map-not-editable", reference: "https://example.com/deps.json" },
  { kind: "entry-not-edited", field: "catalog", name: "a" },
  { kind: "name-collision", field: "dependencies", from: "a", to: "b" },
  { kind: "catalog-reference-kept", field: "dependencies", name: "a", catalog: "default" },
  { kind: "catalog-entry-outside", field: "dependencies", name: "a", catalog: "default" },
  { kind: "catalog-entry-in-use", catalog: "catalogs.legacy", name: "a" },
  { kind: "peer-dependency-renamed", name: "b" },
  { kind: "spec-kept", name: "b", spec: "latest" },
  { kind: "override-names-package", field: "overrides", name: "a" },
  { kind: "setting-names-package", field: "pnpm.packageExtensions", name: "openapi-fetch" },
  { kind: "versioned-command", location: "ci.yml:3" },
  { kind: "old-name-in-command", location: "ci.yml:4", word: "openapi-typescript" },
  { kind: "flags-in-variable", location: "Makefile:4", variable: "$(FLAGS)", flags: ["-it"] },
  {
    kind: "variable-not-only-generator",
    location: "Dockerfile:6",
    variable: "$GEN",
    flags: ["-it", "--redoc"],
  },
  { kind: "pinned-package", location: "scripts.setup", name: "openapi-fetch" },
  {
    kind: "old-package-file",
    location: "Makefile:2",
    path: "node_modules/openapi-typescript/x.js",
  },
  { kind: "command-string", line: 8, to: "npx openapi-typesafe a.yaml" },
  { kind: "options-not-inspected", line: 9 },
  { kind: "deep-import", line: 2, specifier: "b/x" },
  {
    kind: "old-package-import",
    line: 3,
    specifier: "../node_modules/openapi-fetch/x.js",
    name: "openapi-fetch",
    to: "openapi-typesafe-fetch",
  },
  { kind: "deep-target", location: "imports.#b", specifier: "b/x" },
  { kind: "dynamic-specifier", line: 2, value: `openapi-fetch\${x}`, to: "openapi-typesafe-fetch" },
  { kind: "string-names-package", line: 6, value: "openapi-fetch", to: "openapi-typesafe-fetch" },
  { kind: "old-peer-needed", dependent: "swr-openapi", peer: "openapi-fetch", range: ">=0.15" },
  { kind: "transform-not-rewritten", line: 4, reason: "other-callbacks" },
  { kind: "transform-not-rewritten", line: 4, reason: "not-a-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "shared-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "shared-options" },
  { kind: "transform-not-rewritten", line: 4, reason: "unknown-return" },
  { kind: "transform-not-rewritten", line: 4, reason: "typed-options" },
  { kind: "legacy-callback", line: 5, callback: "postTransform" },
  {
    kind: "package-not-declared",
    line: 1,
    name: "openapi-typesafe-helpers",
    installers: ["openapi-fetch", "openapi-react-query"],
  },
];

describe("manualStepMessage", () => {
  it("manualStepMessage describes every kind of manual step", () => {
    expect(STEPS.map(manualStepMessage)).toMatchSnapshot();
  });
});
