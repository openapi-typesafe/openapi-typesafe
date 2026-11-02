// CommonJS consumer smoke test (ENGINEERING_PLAN 8.2): the same checks as esm.mjs through
// `require()`, which loads the `.cjs` builds and, for the generator, its ESM-only dependencies.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { default: openapiTS, astToString } = require("openapi-typesafe");
const { default: createClient } = require("openapi-typesafe-fetch");

const SCHEMA = JSON.parse(readFileSync(join(__dirname, "checks.json"), "utf8"));
const PETS = ["cat", "dog"];

function check(name, isPassed, details) {
  if (!isPassed) {
    process.stderr.write(`FAIL cjs ${name}: ${details}\n`);
    process.exit(1);
  }
  process.stdout.write(`ok cjs ${name}\n`);
}

async function main() {
  const output = astToString(await openapiTS(structuredClone(SCHEMA), { silent: true }));
  check("generate", output.includes('"/pets": {'), output.slice(0, 200));

  const client = createClient({
    baseUrl: "https://api.example.com",
    fetch: async () => Response.json(PETS),
  });
  const { data } = await client.GET("/pets");
  check("fetch", JSON.stringify(data) === JSON.stringify(PETS), JSON.stringify(data));
}

main().catch((error) => {
  process.stderr.write(`FAIL cjs: ${error.stack ?? error}\n`);
  process.exit(1);
});
