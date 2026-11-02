// Stand-in for a generator CLI: `node fake-generator-cli.mjs <schema> --output <file> [--mode=...]`.
import { writeFileSync } from "node:fs";

const [schemaPath, , outputPath, mode = "--mode=ok"] = process.argv.slice(2);

if (mode === "--mode=fail") {
  process.stderr.write(`Error: cannot read ${schemaPath}\n`);
  process.exit(1);
}
if (mode === "--mode=hang") {
  setInterval(() => {}, 1_000);
} else {
  writeFileSync(outputPath, `// generated from ${schemaPath} in ${process.cwd()}\n`);
}
