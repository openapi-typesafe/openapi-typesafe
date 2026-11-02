// Print the first differences between Redocly 1.x and 2.x bundles of one document.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const here = new URL(".", import.meta.url).pathname;
const file = process.argv[2];
async function bundleWith(dir) {
  const r = await import(pathToFileURL(join(here, dir, "node_modules/@redocly/openapi-core/lib/index.js")).href);
  const config = await r.createConfig({});
  return (await r.bundle({ ref: file, config, dereference: false })).bundle.parsed;
}
const [a, b] = [await bundleWith("r1"), await bundleWith("r2")];
const out = [];
function walk(x, y, path) {
  if (out.length >= 6) {
    return;
  }
  if (JSON.stringify(x) === JSON.stringify(y)) {
    return;
  }
  if (x && y && typeof x === "object" && typeof y === "object") {
    const keysX = Object.keys(x),
      keysY = Object.keys(y);
    if (keysX.join() !== keysY.join() && keysX.slice().sort().join() === keysY.slice().sort().join()) {
      out.push(`${path}: same keys, different order`);
      return;
    }
    for (const k of new Set([...keysX, ...keysY])) {
      walk(x[k], y[k], `${path}/${k}`);
    }
    return;
  }
  out.push(`${path}: v1=${JSON.stringify(x)?.slice(0, 120)} v2=${JSON.stringify(y)?.slice(0, 120)}`);
}
walk(a, b, "");
process.stdout.write(`${out.join("\n")}\n`);
