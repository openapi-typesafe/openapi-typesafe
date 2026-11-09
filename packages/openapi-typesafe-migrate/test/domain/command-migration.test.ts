import { describe, expect, it } from "vitest";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";

const LARGE_FILE_LINES = 100_000;
/**
 * The linear count takes 0.1 s on a laptop and 3.2 s on the slowest CI runner (Intel macOS);
 * counting the line breaks again for each command took 57 s on the laptop. The limit sits
 * between the two with room on both sides, since a fixed limit cannot follow machine speed.
 */
const TIME_LIMIT_MS = 20_000;
/** Above the limit, so a slow run fails on the time check, which prints the time it took. */
const TEST_TIMEOUT_MS = 2 * TIME_LIMIT_MS;

describe("migrateCommand", () => {
  it("migrateCommand renames the generator command after shell punctuation", () => {
    const migrated = migrateCommand(
      "npx openapi-typescript a.yaml -o b.ts && (openapi-typescript c)",
      "scripts.gen",
    );

    expect(migrated.text).toBe("npx openapi-typesafe a.yaml -o b.ts && (openapi-typesafe c)");
    expect(migrated.changes).toEqual([
      { kind: "command-renamed", location: "scripts.gen" },
      { kind: "command-renamed", location: "scripts.gen" },
    ]);
  });

  it("migrateCommand reports a file of the old package and an argument it cannot tell", () => {
    const text =
      "node node_modules/openapi-typescript/bin/cli.js && echo openapi-typescript-helpers";

    expect(migrateCommand(text, "x")).toEqual({
      text,
      changes: [],
      manualSteps: [
        {
          kind: "old-package-file",
          location: "x",
          path: "node_modules/openapi-typescript/bin/cli.js",
        },
        { kind: "old-name-in-command", location: "x", word: "openapi-typescript-helpers" },
      ],
    });
  });

  it("migrateCommand renames the renamed flags of the migrated command", () => {
    const migrated = migrateCommand(
      "openapi-typescript a.yaml -it --support-array-length --redoc=r.yaml -ap",
      "scripts.gen",
    );

    expect(migrated.text).toBe(
      "openapi-typesafe a.yaml --immutable --array-length --redocly=r.yaml --additional-properties",
    );
    expect(migrated.changes.filter((change) => change.kind === "flag-renamed")).toHaveLength(4);
  });

  it("migrateCommand leaves the flags of other commands alone", () => {
    const text = "other-tool --redoc x";

    expect(migrateCommand(text, "x").text).toBe(text);
  });

  it("migrateCommand reports a command pinned to a version", () => {
    const migrated = migrateCommand("npx openapi-typescript@7 a.yaml", "ci.yml:3");

    expect(migrated.text).toBe("npx openapi-typescript@7 a.yaml");
    expect(migrated.manualSteps).toEqual([{ kind: "versioned-command", location: "ci.yml:3" }]);
  });
});

describe("migrateCommand on the words of each command", () => {
  const text = (script: string): string => migrateCommand(script, "s").text;

  it("migrateCommand renames flags of the generator, not of other commands on the line", () => {
    expect(text("openapi-typescript a.yaml -it && docker run -it --rm alpine echo -ap")).toBe(
      "openapi-typesafe a.yaml --immutable && docker run -it --rm alpine echo -ap",
    );
  });

  it("migrateCommand renames a command that docker runs, and keeps the flags of docker", () => {
    expect(text("docker run -it -v $PWD:/w -w /w node:22 npx openapi-typescript a -it")).toBe(
      "docker run -it -v $PWD:/w -w /w node:22 npx openapi-typesafe a --immutable",
    );
  });

  it("migrateCommand never renames a script name, and reports it", () => {
    for (const script of [
      "npm run openapi-typescript",
      "pnpm run openapi-typescript -- -it",
      "yarn run openapi-typescript",
      "bun run openapi-typescript",
    ]) {
      const migrated = migrateCommand(script, "s");

      expect(migrated.text).toBe(script);
      expect(migrated.manualSteps).toEqual([
        { kind: "old-name-in-command", location: "s", word: "openapi-typescript" },
      ]);
    }
  });

  it.each([
    ["nice -n 10 openapi-typescript a", "nice -n 10 openapi-typesafe a"],
    ["timeout -s KILL 60 openapi-typescript a", "timeout -s KILL 60 openapi-typesafe a"],
    ["xargs -n 1 openapi-typescript -it", "xargs -n 1 openapi-typesafe --immutable"],
    ["command openapi-typescript a", "command openapi-typesafe a"],
    ["exec -a gen openapi-typescript a", "exec -a gen openapi-typesafe a"],
    [
      "dotenvx run -f .env -- npx openapi-typescript a",
      "dotenvx run -f .env -- npx openapi-typesafe a",
    ],
    ["doppler run -p api -- openapi-typescript a", "doppler run -p api -- openapi-typesafe a"],
    ["nx exec -- openapi-typescript a", "nx exec -- openapi-typesafe a"],
    ["yarn workspace api openapi-typescript a", "yarn workspace api openapi-typesafe a"],
    ["bun openapi-typescript a", "bun openapi-typesafe a"],
    ["bun x openapi-typescript a", "bun x openapi-typesafe a"],
    ["corepack pnpm dlx openapi-typescript a", "corepack pnpm dlx openapi-typesafe a"],
    [
      "tsx --import ./env.ts node_modules/.bin/openapi-typescript a",
      "tsx --import ./env.ts node_modules/.bin/openapi-typesafe a",
    ],
    [
      "ts-node -P tsconfig.json node_modules/.bin/openapi-typescript a",
      "ts-node -P tsconfig.json node_modules/.bin/openapi-typesafe a",
    ],
  ])("migrateCommand renames the generator after a wrapper: %s", (script, migrated) => {
    expect(text(script)).toBe(migrated);
  });

  it("migrateCommand reports the generator after a program it does not know", () => {
    const migrated = migrateCommand("chronic openapi-typescript a -it && echo done", "s");

    expect(migrated.text).toBe("chronic openapi-typescript a -it && echo done");
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "s", word: "openapi-typescript" },
    ]);
  });

  it("migrateCommand reports a path to the old binary or a file of an old package", () => {
    const migrated = migrateCommand(
      "chronic ./node_modules/.bin/openapi-typescript && cat node_modules/openapi-fetch/README.md",
      "s",
    );

    expect(migrated.manualSteps.map((step) => step.kind)).toEqual([
      "old-name-in-command",
      "old-name-in-command",
    ]);
  });

  it.each([
    ["npx -y openapi-typescript a", "npx -y openapi-typesafe a"],
    ["pnpm exec openapi-typescript a", "pnpm exec openapi-typesafe a"],
    ["pnpm --filter api exec openapi-typescript a", "pnpm --filter api exec openapi-typesafe a"],
    ["pnpm dlx openapi-typescript a", "pnpm dlx openapi-typesafe a"],
    ["yarn openapi-typescript a", "yarn openapi-typesafe a"],
    ["bunx openapi-typescript a", "bunx openapi-typesafe a"],
    ["npm exec -- openapi-typescript a", "npm exec -- openapi-typesafe a"],
    ["cross-env NODE_ENV=ci openapi-typescript a", "cross-env NODE_ENV=ci openapi-typesafe a"],
    ["dotenv -e .env -- openapi-typescript a", "dotenv -e .env -- openapi-typesafe a"],
    ["A=1 openapi-typescript a", "A=1 openapi-typesafe a"],
    ['"openapi-typescript" a', '"openapi-typesafe" a'],
    ["@npx openapi-typescript a", "@npx openapi-typesafe a"],
    ["-@openapi-typescript a -it", "-@openapi-typesafe a --immutable"],
    ["RUN npx openapi-typescript a", "RUN npx openapi-typesafe a"],
    [
      "RUN --mount=type=cache,target=/c npx openapi-typescript a",
      "RUN --mount=type=cache,target=/c npx openapi-typesafe a",
    ],
  ])("migrateCommand renames the generator that a launcher runs: %s", (script, migrated) => {
    expect(text(script)).toBe(migrated);
  });

  it.each([
    [
      "node ./node_modules/.bin/openapi-typescript a -it",
      "node ./node_modules/.bin/openapi-typesafe a --immutable",
    ],
    ["node_modules/.bin/openapi-typescript a", "node_modules/.bin/openapi-typesafe a"],
    [
      "deno run -A npm:openapi-typescript a --redoc=r",
      "deno run -A npm:openapi-typesafe a --redocly=r",
    ],
  ])(
    "migrateCommand renames the generator run by path or npm specifier: %s",
    (script, migrated) => {
      expect(text(script)).toBe(migrated);
    },
  );

  it("migrateCommand renames the package of a Yarn 1 global install", () => {
    expect(text("yarn global add openapi-typescript")).toBe("yarn global add openapi-typesafe");
  });

  it("migrateCommand renames every original package of an install command", () => {
    const migrated = migrateCommand("npm i -D openapi-typescript openapi-fetch zod", "s");

    expect(migrated.text).toBe("npm i -D openapi-typesafe openapi-typesafe-fetch zod");
    expect(migrated.changes).toEqual([
      {
        kind: "package-name-renamed",
        location: "s",
        from: "openapi-typescript",
        to: "openapi-typesafe",
      },
      {
        kind: "package-name-renamed",
        location: "s",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });

  it.each([
    ["pnpm add openapi-react-query", "pnpm add openapi-typesafe-react-query"],
    ["yarn remove openapi-typescript-helpers", "yarn remove openapi-typesafe-helpers"],
    ["deno add npm:openapi-fetch", "deno add npm:openapi-typesafe-fetch"],
    [
      "npx -p openapi-typescript openapi-typescript a",
      "npx -p openapi-typesafe openapi-typesafe a",
    ],
    ["npx --package=openapi-fetch tool", "npx --package=openapi-typesafe-fetch tool"],
  ])("migrateCommand renames package arguments: %s", (script, migrated) => {
    expect(text(script)).toBe(migrated);
  });

  it("migrateCommand reports a pinned package argument and keeps it", () => {
    const migrated = migrateCommand(
      "bun add openapi-fetch@0.13 && npx -p openapi-typescript@7 x",
      "s",
    );

    expect(migrated.text).toBe("bun add openapi-fetch@0.13 && npx -p openapi-typescript@7 x");
    expect(migrated.manualSteps).toEqual([
      { kind: "pinned-package", location: "s", name: "openapi-fetch" },
      { kind: "pinned-package", location: "s", name: "openapi-typescript" },
    ]);
  });

  it("migrateCommand renames the generator inside a quoted command line", () => {
    expect(
      text(`sh -c "openapi-typescript a -it" && concurrently 'npx openapi-typescript b'`),
    ).toBe(`sh -c "openapi-typesafe a --immutable" && concurrently 'npx openapi-typesafe b'`);
  });

  it("migrateCommand leaves words that only contain a name, and quoted flags", () => {
    for (const script of [
      "echo openapi-typescript",
      "openapi-typescript'x' a",
      "npm i 'openapi-fetch'x",
      "tool node_modules/.bin/openapi-typescript",
      "npx --yes",
      "@",
      'openapi-typescrip"t" a',
      "npx --registry=https://r openapi-typescrip't'",
    ]) {
      expect(text(script)).toBe(script);
    }
    expect(text("openapi-typescript a '-it'")).toBe("openapi-typesafe a '-it'");
  });
});

describe("migrateCommandLines", () => {
  it("migrateCommandLines renames flags on lines continued with a backslash", () => {
    const migrated = migrateCommandLines(
      "npx openapi-typescript ./api.yaml \\\n  --immutable-types \\\n  -o schema.ts\n",
      "ci.sh",
    );

    expect(migrated.text).toBe(
      "npx openapi-typesafe ./api.yaml \\\n  --immutable \\\n  -o schema.ts\n",
    );
    expect(migrated.changes).toEqual([
      { kind: "command-renamed", location: "ci.sh:1" },
      { kind: "flag-renamed", location: "ci.sh:2", from: "--immutable-types", to: "--immutable" },
    ]);
  });

  it("migrateCommandLines leaves comments", () => {
    const text = "# openapi-typescript a -it\n";

    expect(migrateCommandLines(text, "gen.sh").text).toBe(text);
  });

  it("migrateCommandLines names each change by file and line", () => {
    const migrated = migrateCommandLines("set -e\nopenapi-typescript a.yaml\n", "gen.sh");

    expect(migrated.text).toBe("set -e\nopenapi-typesafe a.yaml\n");
    expect(migrated.changes).toEqual([{ kind: "command-renamed", location: "gen.sh:2" }]);
  });

  it("migrateCommandLines renames commands inside compound commands", () => {
    const text = [
      "if [ -f api.yaml ]; then",
      "  npx openapi-typescript api.yaml -it",
      "fi",
      'for f in specs/*.yaml; do npx openapi-typescript "$f" -it; done',
      "! openapi-typescript a.yaml --redoc r.yaml",
      "",
    ].join("\n");

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      [
        "if [ -f api.yaml ]; then",
        "  npx openapi-typesafe api.yaml --immutable",
        "fi",
        'for f in specs/*.yaml; do npx openapi-typesafe "$f" --immutable; done',
        "! openapi-typesafe a.yaml --redocly r.yaml",
        "",
      ].join("\n"),
    );
    expect(migrated.changes.map((change) => ("location" in change ? change.location : ""))).toEqual(
      ["gen.sh:2", "gen.sh:2", "gen.sh:4", "gen.sh:4", "gen.sh:5", "gen.sh:5"],
    );
  });

  it("migrateCommandLines names the lines of a large file in linear time", {
    timeout: TEST_TIMEOUT_MS,
  }, () => {
    // 100 000 commands took 57 s when each place counted the line breaks before it.
    const lines = Array.from({ length: LARGE_FILE_LINES }, (_, index) => `echo ${index}`);
    const text = `${lines.join("\n")}\nopenapi-typescript a.yaml -it\n`;
    const started = performance.now();

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(performance.now() - started).toBeLessThan(TIME_LIMIT_MS);
    expect(migrated.changes[0]).toEqual({
      kind: "command-renamed",
      location: `gen.sh:${LARGE_FILE_LINES + 1}`,
    });
  });

  it("migrateCommandLines collects manual steps of every line", () => {
    const migrated = migrateCommandLines("npx openapi-typescript@6 a\n", "Makefile");

    expect(migrated.manualSteps).toEqual([{ kind: "versioned-command", location: "Makefile:1" }]);
  });
});
