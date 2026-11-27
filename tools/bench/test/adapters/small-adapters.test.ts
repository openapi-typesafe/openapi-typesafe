import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeDocumentFiles } from "../../src/adapters/node-document-files.ts";
import { packageLabelOf } from "../../src/adapters/package-label.ts";
import { StreamProgressReporter } from "../../src/adapters/stream-progress-reporter.ts";

function fixture(path: string): string {
  return fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url));
}

describe("packageLabelOf", () => {
  it("packageLabelOf a bin/cli.js returns the name and version of its package", async () => {
    expect(await packageLabelOf(fixture("stand-in-generator/bin/cli.js"))).toBe(
      "stand-in-generator 1.2.3",
    );
  });

  it.each(["nameless-generator", "versionless-generator"])(
    "packageLabelOf a package without a name or a version (%s) throws",
    async (directory) => {
      await expect(packageLabelOf(fixture(`${directory}/bin/cli.js`))).rejects.toThrow(
        /no name and version/,
      );
    },
  );
});

describe("NodeDocumentFiles", () => {
  it("byteLength of a file returns its size in bytes", async () => {
    const path = fixture("stand-in-generator/package.json");

    expect(await new NodeDocumentFiles().byteLength(path)).toBeGreaterThan(0);
  });

  it("byteLength of a missing file rejects", async () => {
    await expect(new NodeDocumentFiles().byteLength(fixture("missing.yaml"))).rejects.toThrow(
      /ENOENT/,
    );
  });
});

describe("StreamProgressReporter", () => {
  it("runFinished writes one line with the label, the run and the duration", () => {
    const written: string[] = [];

    new StreamProgressReporter((text) => written.push(text)).runFinished({
      label: "Stripe / gen 1.0.0",
      run: "run 2/5",
      wallMs: 1_250,
    });

    expect(written).toEqual(["Stripe / gen 1.0.0: run 2/5 1.3 s\n"]);
  });
});
