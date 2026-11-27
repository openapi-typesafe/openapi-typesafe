// Bundle every document of a directory with one loader; print one JSON line per document.
// Usage: node evaluate.mjs <r1|r2|jsrp> <documents dir>
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [loaderName, documentsDir] = process.argv.slice(2);
const here = new URL(".", import.meta.url).pathname;
const load = (dir, pkg) => import(pathToFileURL(join(here, dir, "node_modules", pkg, "lib/index.js")).href);

async function makeBundler() {
  if (loaderName === "r1" || loaderName === "r2") {
    const redocly = await load(loaderName, "@redocly/openapi-core");
    const config = await redocly.createConfig({});
    return async (path) => {
      const result = await redocly.bundle({ ref: path, config, dereference: false });
      const errors = result.problems.filter((problem) => problem.severity === "error");
      if (errors.length > 0) {
        throw new Error(errors[0].message);
      }
      return result.bundle.parsed;
    };
  }
  const { default: $RefParser } = await import(
    pathToFileURL(join(here, "jsrp/node_modules/@apidevtools/json-schema-ref-parser/dist/lib/index.js")).href
  );
  return (path) => $RefParser.bundle(path);
}

function countExternalRefs(node) {
  if (Array.isArray(node)) {
    return node.reduce((sum, item) => sum + countExternalRefs(item), 0);
  }
  if (node === null || typeof node !== "object") {
    return 0;
  }
  let count = typeof node.$ref === "string" && !node.$ref.startsWith("#") ? 1 : 0;
  for (const value of Object.values(node)) {
    count += countExternalRefs(value);
  }
  return count;
}

const bundleDocument = await makeBundler();
for (const file of readdirSync(documentsDir).sort()) {
  const started = performance.now();
  try {
    const bundled = await bundleDocument(join(documentsDir, file));
    const sha256 = createHash("sha256").update(JSON.stringify(bundled)).digest("hex");
    const ms = Math.round(performance.now() - started);
    process.stdout.write(
      `${JSON.stringify({ file, ok: true, ms, sha256, externalRefs: countExternalRefs(bundled) })}\n`,
    );
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    process.stdout.write(
      `${JSON.stringify({ file, ok: false, ms, error: String(error?.message ?? error).split("\n")[0] })}\n`,
    );
  }
}
