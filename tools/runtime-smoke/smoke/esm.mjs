// ESM consumer smoke test (ENGINEERING_PLAN 8.2): the generator Node API and the fetch client load
// through `import` and work. Plain JavaScript, so Node, Bun and Deno run it unchanged.
import { readFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typesafe";
import createClient from "openapi-typesafe-fetch";

const SCHEMA = JSON.parse(readFileSync(new URL("./checks.json", import.meta.url), "utf8"));
const PETS = ["cat", "dog"];

function check(name, isPassed, details) {
  if (!isPassed) {
    process.stderr.write(`FAIL esm ${name}: ${details}\n`);
    process.exit(1);
  }
  process.stdout.write(`ok esm ${name}\n`);
}

const output = astToString(await openapiTS(structuredClone(SCHEMA), { silent: true }));
check("generate", output.includes('"/pets": {'), output.slice(0, 200));

const client = createClient({
  baseUrl: "https://api.example.com",
  fetch: async () => Response.json(PETS),
});
const { data } = await client.GET("/pets");
check("fetch", JSON.stringify(data) === JSON.stringify(PETS), JSON.stringify(data));
