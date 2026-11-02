// Check whether a Redocly version can lint an OpenAPI 3.2 document (the generator lints before bundling).
// Usage: node lint32.mjs <r1|r2> <document path>
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [dir, file] = process.argv.slice(2);
const here = new URL(".", import.meta.url).pathname;
const redocly = await import(pathToFileURL(join(here, dir, "node_modules/@redocly/openapi-core/lib/index.js")).href);
const config = await redocly.createConfig({}, { extends: ["minimal"] });
const resolver = new redocly.BaseResolver();
const document = await resolver.resolveDocument(null, file, true);
try {
  const problems = await redocly.lintDocument({
    document,
    config: config.styleguide ?? config,
    externalRefResolver: resolver,
  });
  const errors = problems.filter((problem) => problem.severity === "error").map((problem) => problem.message);
  process.stdout.write(`${dir} lint ok, errors: ${JSON.stringify(errors.slice(0, 3))}\n`);
} catch (error) {
  process.stdout.write(`${dir} lint threw: ${error.message}\n`);
}
