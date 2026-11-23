// A stand-in for a generator CLI (`cli <document> -o <file>`): a document named `broken.yaml`
// fails with a message, `slow.yaml` never ends, `abrupt.yaml` exits with code 0 but skips the
// "exit" event (so the memory probe writes nothing), anything else writes a small output file.
import { writeFileSync } from "node:fs";
import { basename } from "node:path";

const [document] = process.argv.slice(2);
const output = process.argv[process.argv.indexOf("-o") + 1];
const name = basename(document);
if (name === "broken.yaml") {
  process.stderr.write("cannot read broken.yaml\n");
  process.exit(1);
}
if (name === "abrupt.yaml") {
  // reallyExit ends the process without emitting "exit", like a native crash with code 0.
  process.reallyExit(0);
}
if (name === "slow.yaml") {
  setInterval(() => {}, 1_000);
} else {
  writeFileSync(output, "export interface paths {}\n");
}
