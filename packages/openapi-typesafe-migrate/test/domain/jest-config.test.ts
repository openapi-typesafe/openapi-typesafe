import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import {
  isJestConfig,
  jestJsonSteps,
  jestScriptSteps,
  oldPackagesInPattern,
} from "../../src/domain/jest-config.js";

describe("oldPackagesInPattern", () => {
  it.each([
    ["^openapi-fetch$", ["openapi-fetch"]],
    [
      "node_modules/(?!(openapi-fetch|openapi-react-query)/)",
      ["openapi-fetch", "openapi-react-query"],
    ],
    ["^openapi-typescript-helpers(.*)$", ["openapi-typescript-helpers"]],
    ["openapi-fetch-mock", []],
    ["^(openapi-fetch-mock|openapi-fetch)$", ["openapi-fetch"]],
    ["my_openapi-fetch", []],
    ["^openapi-typesafe-fetch$", []],
  ])("oldPackagesInPattern finds in %s the packages %j", (pattern, names) => {
    expect(oldPackagesInPattern(pattern)).toEqual(names);
  });
});

describe("isJestConfig", () => {
  it.each(["jest.config.js", "jest.config.mts", "jest.config.cjs", "jest.config.json"])(
    "isJestConfig takes %s for a Jest config",
    (name) => {
      expect(isJestConfig(name)).toBe(true);
    },
  );

  it.each(["jest.setup.js", "vite.config.ts", "jest.config.yaml", "my-jest.config.js"])(
    "isJestConfig does not take %s for a Jest config",
    (name) => {
      expect(isJestConfig(name)).toBe(false);
    },
  );
});

describe("jestScriptSteps", () => {
  it("jestScriptSteps reports the patterns of a config script, not its specifiers or names", () => {
    const text = 'require("openapi-fetch/setup");\nx = { "^openapi-fetch$": "openapi-fetch" };\n';
    const at = (value: string, from = 0) => text.indexOf(value, from);
    const strings = [
      { start: at("openapi-fetch"), end: 0, value: "openapi-fetch/setup", isModuleSpecifier: true },
      { start: at("^openapi"), end: 0, value: "^openapi-fetch$", isModuleSpecifier: false },
      {
        start: at('"openapi-fetch"', 30) + 1,
        end: 0,
        value: "openapi-fetch",
        isModuleSpecifier: false,
      },
    ];

    expect(jestScriptSteps(text, strings)).toEqual([
      {
        kind: "pattern-names-package",
        location: "line 2",
        value: "^openapi-fetch$",
        name: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });
});

describe("jestScriptSteps module strings", () => {
  it.each(["openapi-fetch/$1", "npm:openapi-fetch@^0.13.0"])(
    "jestScriptSteps leaves %s to the report of strings that name a package",
    (value) => {
      const strings = [{ start: 0, end: 0, value, isModuleSpecifier: false }];

      expect(jestScriptSteps(`"${value}"`, strings)).toEqual([]);
    },
  );
});

describe("jestJsonSteps", () => {
  it("jestJsonSteps reports the keys and values of jest.config.json by their place", () => {
    const read = createJsonTextReader().read(
      JSON.stringify({
        moduleNameMapper: { "^openapi-fetch$": "<rootDir>/m.ts" },
        transformIgnorePatterns: ["node_modules/(?!openapi-react-query)"],
      }),
    );

    expect(jestJsonSteps(read).map((step) => "location" in step && step.location)).toEqual([
      "moduleNameMapper",
      "transformIgnorePatterns.0",
    ]);
    expect(jestJsonSteps({ kind: "unreadable", offset: 0 })).toEqual([]);
  });

  it("jestJsonSteps reports a value that is just an old package name, which nothing else reports", () => {
    const read = createJsonTextReader().read(
      JSON.stringify({ moduleNameMapper: { "^@api$": "openapi-fetch" } }),
    );

    expect(jestJsonSteps(read)).toEqual([
      {
        kind: "pattern-names-package",
        location: "moduleNameMapper.^@api$",
        value: "openapi-fetch",
        name: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });
});
